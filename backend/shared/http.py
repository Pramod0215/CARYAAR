from collections.abc import Callable
from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.engine import Engine

from shared.config import get_settings
from shared.database import Base
from shared.events import run_outbox_publisher


def configure_service(
    app: FastAPI,
    engine: Engine,
    after_create: Callable[[], None] | None = None,
    publish_events: bool = True,
) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().allowed_frontend_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        try:
            Base.metadata.create_all(bind=engine)
            if after_create is not None:
                after_create()
            if publish_events:
                publisher_task = asyncio.create_task(run_outbox_publisher(engine))
            yield
        finally:
            if publish_events and "publisher_task" in locals():
                publisher_task.cancel()
                try:
                    await publisher_task
                except asyncio.CancelledError:
                    pass
            engine.dispose()

    app.router.lifespan_context = lifespan
