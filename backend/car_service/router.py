import asyncio
from io import BytesIO
import warnings
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from database import get_db
from model import Car
from schemas import CarImageResponse, CarInput, CarResponse, CarUpdate, Fuel
from shared.config import get_settings
from shared.security import get_current_user_id

router = APIRouter(prefix="/api/v1/cars", tags=["cars"])
MAX_IMAGE_SIZE = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 12_000_000
IMAGE_FORMATS = {
    "image/jpeg": ("JPEG", ".jpg"),
    "image/png": ("PNG", ".png"),
    "image/webp": ("WEBP", ".webp"),
}


def _get_car_or_404(session: Session, car_id: UUID) -> Car:
    car = session.get(Car, car_id)
    if car is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Car listing not found")
    return car


def _require_owner(car: Car, user_id: UUID) -> None:
    if car.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this listing")


def _prepare_car_image(content: bytes, content_type: str) -> tuple[bytes, str]:
    expected = IMAGE_FORMATS.get(content_type.lower())
    if expected is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Upload a JPEG, PNG, or WebP image.",
        )

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            image = Image.open(BytesIO(content))
            if image.format != expected[0]:
                raise HTTPException(
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    detail="The image contents do not match the selected file type.",
                )
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Image dimensions must not exceed 12 megapixels.",
                )
            image.verify()

        with Image.open(BytesIO(content)) as image:
            image.load()
            cleaned = ImageOps.exif_transpose(image)
            output = BytesIO()
            if expected[0] == "JPEG":
                cleaned.convert("RGB").save(output, format="JPEG", quality=90, optimize=True)
            elif expected[0] == "PNG":
                cleaned.save(output, format="PNG", optimize=True)
            else:
                cleaned.save(output, format="WEBP", quality=90, method=4)
        return output.getvalue(), expected[1]
    except HTTPException:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image dimensions exceed the supported limit.",
        ) from exc
    except (OSError, SyntaxError, ValueError, UnidentifiedImageError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The uploaded file is not a valid image.",
        ) from exc


@router.get("", response_model=list[CarResponse])
def list_cars(
    search: str | None = Query(default=None, min_length=1, max_length=100),
    fuel: Fuel | None = None,
    location: str | None = Query(default=None, min_length=1, max_length=100),
    min_price: Decimal | None = Query(default=None, gt=0),
    max_price: Decimal | None = Query(default=None, gt=0),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    session: Session = Depends(get_db),
):
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="min_price must not exceed max_price",
        )
    statement = select(Car).where(Car.status == "active")
    if search:
        term = f"%{search.strip()}%"
        statement = statement.where(
            or_(Car.make.ilike(term), Car.model.ilike(term), Car.location.ilike(term))
        )
    if fuel:
        statement = statement.where(Car.fuel == fuel)
    if location:
        statement = statement.where(Car.location.ilike(f"%{location.strip()}%"))
    if min_price is not None:
        statement = statement.where(Car.price >= min_price)
    if max_price is not None:
        statement = statement.where(Car.price <= max_price)
    return session.scalars(
        statement.order_by(Car.created_at.desc()).offset(offset).limit(limit)
    ).all()


@router.get("/mine", response_model=list[CarResponse])
def list_my_cars(
    user_id: UUID = Depends(get_current_user_id),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    session: Session = Depends(get_db),
):
    statement = (
        select(Car)
        .where(Car.owner_id == user_id)
        .order_by(Car.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return session.scalars(statement).all()


@router.post("", response_model=CarResponse, status_code=status.HTTP_201_CREATED)
def create_car(
    payload: CarInput,
    user_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db),
):
    car = Car(owner_id=user_id, **payload.model_dump(mode="json"))
    session.add(car)
    session.commit()
    session.refresh(car)
    return car


@router.post("/{car_id}/image", response_model=CarImageResponse)
async def upload_car_image(
    car_id: UUID,
    image: UploadFile = File(...),
    user_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db),
):
    if image.size is not None and image.size > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image file must be 5 MB or smaller.",
        )

    content = await image.read(MAX_IMAGE_SIZE + 1)
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image file must be 5 MB or smaller.",
        )

    content, extension = _prepare_car_image(content, image.content_type or "")
    car = _get_car_or_404(session, car_id)
    _require_owner(car, user_id)

    image_directory = get_settings().car_image_directory()
    await asyncio.to_thread(image_directory.mkdir, parents=True, exist_ok=True)
    filename = f"{uuid4()}{extension}"
    await asyncio.to_thread((image_directory / filename).write_bytes, content)
    car.image_url = f"/uploads/{filename}"
    session.commit()
    return CarImageResponse(image_url=car.image_url)


@router.get("/{car_id}", response_model=CarResponse)
def get_car(car_id: UUID, session: Session = Depends(get_db)):
    car = _get_car_or_404(session, car_id)
    if car.status != "active":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Car listing not found")
    return car


@router.put("/{car_id}", response_model=CarResponse)
def update_car(
    car_id: UUID,
    payload: CarUpdate,
    user_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db),
):
    car = _get_car_or_404(session, car_id)
    _require_owner(car, user_id)
    for key, value in payload.model_dump(mode="json").items():
        setattr(car, key, value)
    session.commit()
    session.refresh(car)
    return car


@router.delete("/{car_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_car(
    car_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db),
):
    car = _get_car_or_404(session, car_id)
    _require_owner(car, user_id)
    session.delete(car)
    session.commit()