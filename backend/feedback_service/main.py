from fastapi import FastAPI
from sqlalchemy import text

from database import engine
from router import router
from shared.http import configure_service

app = FastAPI(title="CarYAAR Feedback API", version="1.0.0")
configure_service(app, engine)
app.include_router(router)


@app.get("/health", tags=["health"])
def health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok", "service": "feedback"}