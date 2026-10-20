from collections.abc import Generator

from sqlalchemy.orm import Session

from shared.database import create_service_engine, create_session_factory, get_db_session

engine = create_service_engine("auth")
SessionFactory = create_session_factory(engine)


def get_db() -> Generator[Session, None, None]:
    yield from get_db_session(SessionFactory)