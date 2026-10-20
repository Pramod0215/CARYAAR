import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
SERVICES = ("auth-service", "car_service", "feedback_service", "support_service")


class ApiIntegrationTests(unittest.TestCase):
    def test_service_endpoints(self):
        database_url = os.environ.get("BACKEND_TEST_DATABASE_URL", "sqlite://")
        env = os.environ.copy()
        env.update(
            {
                "JWT_SECRET_KEY": "integration-test-only-secret-change-me-32chars",
                "AUTH_DATABASE_URL": database_url,
                "CAR_DATABASE_URL": database_url,
                "FEEDBACK_DATABASE_URL": database_url,
                "SUPPORT_DATABASE_URL": database_url,
                "HF_TOKEN": "integration-test-token",
            }
        )
        for service in SERVICES:
            with self.subTest(service=service):
                if service == "car_service":
                    with tempfile.TemporaryDirectory(prefix="caryaar-test-uploads-") as upload_dir:
                        env["CAR_IMAGE_UPLOAD_DIR"] = upload_dir
                        result = subprocess.run(
                            [sys.executable, str(Path(__file__).resolve()), service],
                            cwd=BACKEND,
                            env=env,
                            capture_output=True,
                            text=True,
                            check=False,
                        )
                else:
                    result = subprocess.run(
                        [sys.executable, str(Path(__file__).resolve()), service],
                        cwd=BACKEND,
                        env=env,
                        capture_output=True,
                        text=True,
                        check=False,
                    )
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


def run_service_checks(service: str) -> None:
    sys.path.insert(0, str(BACKEND))
    sys.path.insert(0, str(BACKEND / service))
    from fastapi.testclient import TestClient

    from main import app

    with TestClient(app) as client:
        assert client.get("/health").status_code == 200

        if service == "auth-service":
            registration = client.post(
                "/api/v1/auth/register",
                json={
                    "name": "Test User",
                    "email": "TEST@example.com",
                    "password": "test-password-123",
                },
            )
            assert registration.status_code == 201, registration.text
            token = registration.json()["access_token"]
            assert client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            ).json()["email"] == "test@example.com"
            assert client.post(
                "/api/v1/auth/register",
                json={
                    "name": "Duplicate User",
                    "email": "test@example.com",
                    "password": "test-password-123",
                },
            ).status_code == 409
            assert client.post(
                "/api/v1/auth/login",
                json={"email": "test@example.com", "password": "incorrect"},
            ).status_code == 401

        elif service == "car_service":
            from io import BytesIO
            from uuid import uuid4

            from PIL import Image
            from shared.security import create_access_token

            owner_token = create_access_token(uuid4())
            demo_cars = client.get("/api/v1/cars").json()
            assert len(demo_cars) == 4
            assert all(car["is_demo"] for car in demo_cars)
            headers = {"Authorization": f"Bearer {owner_token}"}
            payload = {
                "make": "Audi",
                "model": "A3",
                "year": 2020,
                "price": "2500000",
                "kilometres": 10000,
                "fuel": "petrol",
                "transmission": "automatic",
                "location": "Bengaluru",
                "description": "Well maintained car with complete service history.",
            }
            listing = client.post("/api/v1/cars", json=payload, headers=headers)
            assert listing.status_code == 201, listing.text
            car_id = listing.json()["id"]
            matching_cars = client.get("/api/v1/cars", params={"search": "A3"}).json()
            assert car_id in {car["id"] for car in matching_cars}
            assert len(client.get("/api/v1/cars").json()) == 5
            assert len(client.get("/api/v1/cars/mine", headers=headers).json()) == 1
            assert client.get("/api/v1/cars/mine").status_code == 401
            from pathlib import Path

            from shared.config import get_settings

            image_path = get_settings().car_image_directory()
            image_buffer = BytesIO()
            Image.new("RGB", (1, 1), color="white").save(image_buffer, format="PNG")
            image_bytes = image_buffer.getvalue()
            assert client.post(
                f"/api/v1/cars/{car_id}/image",
                files={"image": ("invalid.png", b"not an image", "image/png")},
                headers=headers,
            ).status_code == 422
            uploaded_image = client.post(
                f"/api/v1/cars/{car_id}/image",
                files={
                    "image": (
                        "car.png",
                        image_bytes,
                        "image/png",
                    )
                },
                headers=headers,
            )
            assert uploaded_image.status_code == 200, uploaded_image.text
            image_url = uploaded_image.json()["image_url"]
            assert image_url.startswith("/uploads/")
            assert (image_path / image_url.rsplit("/", 1)[1]).is_file()
            assert client.get(image_url).status_code == 200
            other_user_headers = {
                "Authorization": f"Bearer {create_access_token(uuid4())}"
            }
            assert client.post(
                f"/api/v1/cars/{car_id}/image",
                files={"image": ("car.png", image_bytes, "image/png")},
                headers=other_user_headers,
            ).status_code == 403
            assert client.put(
                f"/api/v1/cars/{car_id}",
                json=payload | {"status": "sold"},
                headers=headers,
            ).status_code == 200
            assert client.get(f"/api/v1/cars/{car_id}").status_code == 404
            assert client.get("/api/v1/cars", params={"min_price": 9, "max_price": 1}).status_code == 422
            assert client.post(
                f"/api/v1/cars/{car_id}/image",
                files={"image": ("not-image.svg", b"<svg></svg>", "image/svg+xml")},
                headers={"Authorization": f"Bearer {create_access_token(uuid4())}"},
            ).status_code == 415
            assert client.delete(f"/api/v1/cars/{car_id}", headers=headers).status_code == 204
            remaining_car_ids = {
                car["id"] for car in client.get("/api/v1/cars").json()
            }
            assert car_id not in remaining_car_ids

        elif service == "feedback_service":
            response = client.post(
                "/api/v1/feedback",
                json={
                    "rating": 5,
                    "category": "overall",
                    "message": "A smooth and helpful experience.",
                    "recommendation": 9,
                    "email": "customer@example.com",
                },
            )
            assert response.status_code == 201, response.text
            assert "email" not in response.json()
            assert client.post(
                "/api/v1/feedback",
                json={
                    "rating": 6,
                    "category": "overall",
                    "message": "A smooth and helpful experience.",
                    "recommendation": 9,
                },
            ).status_code == 422

        elif service == "support_service":
            from types import SimpleNamespace

            import router
            from shared.config import get_settings

            os.environ["HF_TOKEN"] = ""
            get_settings.cache_clear()
            ticket = client.post(
                "/api/v1/support/tickets",
                json={
                    "name": "Test User",
                    "email": "customer@example.com",
                    "topic": "buying",
                    "message": "I need help checking this car.",
                },
            )
            assert ticket.status_code == 201, ticket.text
            assert "email" not in ticket.json() and "message" not in ticket.json()
            assert client.post("/api/v1/support/chat", json={"message": "How do I inspect a car?"}).status_code == 503

            class FakeInferenceClient:
                def __init__(self, **_kwargs):
                    pass

                def chat_completion(self, **_kwargs):
                    return SimpleNamespace(
                        choices=[
                            SimpleNamespace(
                                message=SimpleNamespace(content="Arrange an independent inspection.")
                            )
                        ]
                    )

            router.InferenceClient = FakeInferenceClient
            os.environ["HF_TOKEN"] = "integration-test-token"
            get_settings.cache_clear()
            chat = client.post("/api/v1/support/chat", json={"message": "How do I inspect a car?"})
            assert chat.status_code == 200, chat.text
            assert chat.json()["answer"] == "Arrange an independent inspection."
            assert client.post("/api/v1/support/chat", json={"message": " "}).status_code == 422
        else:
            raise AssertionError(f"Unknown service: {service}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        run_service_checks(sys.argv[1])
    else:
        unittest.main()
