from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from shared.config import get_settings


class Base(DeclarativeBase):
    pass


def create_service_engine(service: str) -> Engine:
    database_url = get_settings().database_url_for(service)
    options = {}
    if database_url.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False}
        if database_url in {"sqlite://", "sqlite:///:memory:"}:
            options["poolclass"] = StaticPool
    return create_engine(database_url, pool_pre_ping=True, **options)


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db_session(factory: sessionmaker[Session]) -> Generator[Session, None, None]:
    with factory() as session:
        yield session
