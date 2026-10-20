from collections.abc import Callable
from contextlib import asynccontextmanager
from collections.abc import Callable

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.engine import Engine

from shared.config import get_settings
from shared.database import Base


def configure_service(
    app: FastAPI,
    engine: Engine,
    after_create: Callable[[], None] | None = None,
) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().allowed_frontend_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        try:
            Base.metadata.create_all(bind=engine)
            if after_create is not None:
                after_create()
            yield
        finally:
            engine.dispose()

    app.router.lifespan_context = lifespan
