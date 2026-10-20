from decimal import Decimal
from uuid import NAMESPACE_DNS, NAMESPACE_URL, uuid5

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import SessionFactory
from model import Car
from shared.config import get_settings

DEMO_OWNER_ID = uuid5(NAMESPACE_DNS, "demo-owner.caryaar.local")
DEMO_CARS = (
    {
        "slug": "a3-2019",
        "make": "Audi",
        "model": "A3 Premium Plus",
        "year": 2019,
        "price": Decimal("2850000"),
        "kilometres": 32400,
        "fuel": "petrol",
        "transmission": "automatic",
        "location": "Bengaluru",
        "description": "Well maintained Audi A3 with verified service history and a smooth automatic transmission.",
    },
    {
        "slug": "etron-2021",
        "make": "Audi",
        "model": "e-tron 55 quattro",
        "year": 2021,
        "price": Decimal("7290000"),
        "kilometres": 18200,
        "fuel": "electric",
        "transmission": "automatic",
        "location": "Mumbai",
        "description": "Electric Audi e-tron with all wheel drive, low mileage and a premium, comfortable cabin.",
    },
    {
        "slug": "a8-2020",
        "make": "Audi",
        "model": "A8 L Technology",
        "year": 2020,
        "price": Decimal("11400000"),
        "kilometres": 27800,
        "fuel": "petrol",
        "transmission": "automatic",
        "location": "Delhi",
        "description": "Spacious Audi A8 L with elegant interior, automatic transmission and documented ownership.",
    },
    {
        "slug": "rs7-2022",
        "make": "Audi",
        "model": "RS 7 Sportback",
        "year": 2022,
        "price": Decimal("18500000"),
        "kilometres": 12600,
        "fuel": "petrol",
        "transmission": "automatic",
        "location": "Hyderabad",
        "description": "Powerful Audi RS 7 Sportback with low mileage, automatic transmission and complete service records.",
    },
)


def seed_demo_cars() -> None:
    if not get_settings().seed_dummy_data:
        return

    with SessionFactory.begin() as session:
        existing_count = session.scalar(select(func.count()).select_from(Car))
        if existing_count:
            return

        session.add_all(
            Car(
                id=uuid5(NAMESPACE_URL, f"https://caryaar.local/demo-cars/{car['slug']}"),
                owner_id=DEMO_OWNER_ID,
                make=car["make"],
                model=car["model"],
                year=car["year"],
                price=car["price"],
                kilometres=car["kilometres"],
                fuel=car["fuel"],
                transmission=car["transmission"],
                location=car["location"],
                description=car["description"],
                image_url=None,
                is_demo=True,
                status="active",
            )
            for car in DEMO_CARS
        )
