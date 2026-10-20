from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI
from sqlalchemy import text

from database import engine
from router import router
from seed import seed_demo_cars
from shared.config import get_settings
from shared.http import configure_service

upload_directory = get_settings().car_image_directory()
upload_directory.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="CarYAAR Car Listings API", version="1.0.0")
configure_service(app, engine, after_create=seed_demo_cars)
app.include_router(router)
app.mount("/uploads", StaticFiles(directory=upload_directory), name="car-images")


@app.get("/health", tags=["health"])
def health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok", "service": "cars"}