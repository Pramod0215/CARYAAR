from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

Fuel = Literal["petrol", "diesel", "electric", "hybrid", "cng", "other"]
Transmission = Literal["manual", "automatic", "other"]
ListingStatus = Literal["active", "sold"]


class CarInput(BaseModel):
    make: str = Field(min_length=1, max_length=50)
    model: str = Field(min_length=1, max_length=80)
    year: int = Field(ge=1886, le=datetime.now(timezone.utc).year + 1)
    price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    kilometres: int = Field(ge=0, le=2_000_000)
    fuel: Fuel
    transmission: Transmission
    location: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=20, max_length=2000)
    image_url: HttpUrl | None = None

    @field_validator("make", "model", "location")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field must not be blank")
        return value

    @field_validator("description")
    @classmethod
    def strip_description(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 20:
            raise ValueError("Description must contain at least 20 non-whitespace characters")
        return value


class CarUpdate(CarInput):
    status: ListingStatus


class CarResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    owner_id: UUID
    make: str
    model: str
    year: int
    price: Decimal
    kilometres: int
    fuel: str
    transmission: str
    location: str
    description: str
    image_url: str | None
    is_demo: bool
    status: str
    created_at: datetime


class CarImageResponse(BaseModel):
    image_url: str
