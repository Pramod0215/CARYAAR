import importlib.util
import unittest
from pathlib import Path

from pydantic import ValidationError

BACKEND = Path(__file__).resolve().parents[1]


def load_schemas(service: str):
    path = BACKEND / service / "schemas.py"
    spec = importlib.util.spec_from_file_location(f"{service}_schemas", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load schemas for {service}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


auth = load_schemas("auth-service")
cars = load_schemas("car_service")
feedback = load_schemas("feedback_service")
support = load_schemas("support_service")


class RequestSchemaTests(unittest.TestCase):
    def test_auth_requires_strong_password_and_normalizes_email(self):
        user = auth.UserCreate(name="  CarYAAR User ", email="USER@example.com", password="secure-password-123")

        self.assertEqual(user.name, "CarYAAR User")
        self.assertEqual(user.email, "user@example.com")
        with self.assertRaises(ValidationError):
            auth.UserCreate(name="User", email="user@example.com", password="short")
        with self.assertRaises(ValidationError):
            auth.UserCreate(name="   ", email="not-an-email", password="secure-password-123")

    def test_car_rejects_invalid_ranges_and_blank_text(self):
        payload = {
            "make": " Audi ",
            "model": " A3 ",
            "year": 2020,
            "price": "2500000",
            "kilometres": 10000,
            "fuel": "petrol",
            "transmission": "automatic",
            "location": " Bengaluru ",
            "description": "Well maintained car with complete service history.",
        }
        car = cars.CarInput(**payload)
        self.assertEqual(car.make, "Audi")
        self.assertEqual(car.location, "Bengaluru")
        for invalid in (
            {"price": 0},
            {"year": 1885},
            {"kilometres": -1},
            {"fuel": "rocket"},
            {"description": " " * 20},
        ):
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                cars.CarInput(**(payload | invalid))

    def test_feedback_validates_rating_recommendation_and_message(self):
        payload = feedback.FeedbackCreate(
            rating=5,
            category="overall",
            message="A smooth and helpful experience.",
            recommendation=8,
            email="USER@example.com",
        )
        self.assertEqual(payload.email, "user@example.com")
        for invalid in (
            {"rating": 0},
            {"recommendation": 11},
            {"message": " " * 10},
            {"category": "unknown"},
        ):
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                feedback.FeedbackCreate(
                    **(
                        {
                            "rating": 5,
                            "category": "overall",
                            "message": "A smooth and helpful experience.",
                            "recommendation": 8,
                        }
                        | invalid
                    )
                )

    def test_support_validates_ticket_and_chat_inputs(self):
        ticket = support.TicketCreate(
            name="Customer",
            email="CUSTOMER@example.com",
            topic="buying",
            message="I need help checking a car listing.",
        )
        self.assertEqual(ticket.email, "customer@example.com")
        self.assertEqual(
            support.ChatRequest(message="  How do I inspect a used car?  ").message,
            "How do I inspect a used car?",
        )
        with self.assertRaises(ValidationError):
            support.TicketCreate(
                name="Customer",
                email="customer@example.com",
                topic="unknown",
                message="Short",
            )
        with self.assertRaises(ValidationError):
            support.ChatRequest(message="  ")


if __name__ == "__main__":
    unittest.main()
