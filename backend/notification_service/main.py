import asyncio
from contextlib import asynccontextmanager
from threading import Event

from fastapi import FastAPI
from sqlalchemy import text

from database import engine
from consumer import run_email_retry, run_notification_consumer
from router import router
from shared.http import configure_service

app = FastAPI(title="CarYAAR Notifications API", version="1.0.0")
configure_service(app, engine, publish_events=False)
database_lifespan = app.router.lifespan_context
app.include_router(router)


@asynccontextmanager
async def notification_lifespan(application: FastAPI):
    stop_event = Event()
    try:
        async with database_lifespan(application):
            consumer_task = asyncio.create_task(
                asyncio.to_thread(run_notification_consumer, stop_event)
            )
            email_task = asyncio.create_task(run_email_retry(engine))
            try:
                yield
            finally:
                stop_event.set()
                email_task.cancel()
                await consumer_task
                try:
                    await email_task
                except asyncio.CancelledError:
                    pass
    finally:
        stop_event.set()


app.router.lifespan_context = notification_lifespan


@app.get("/health", tags=["health"])
def health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok", "service": "notifications"}
