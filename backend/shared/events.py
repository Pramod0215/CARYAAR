import asyncio
from datetime import datetime, timezone
import json
import logging
from uuid import UUID, uuid4

from kafka import KafkaProducer
from sqlalchemy import DateTime, JSON, String, Text, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Mapped, Session, mapped_column

from shared.config import get_settings
from shared.database import Base, create_session_factory

logger = logging.getLogger(__name__)


class EventOutbox(Base):
    __tablename__ = "event_outbox"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    data: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


def enqueue_event(session: Session, event_type: str, data: dict[str, object]) -> UUID:
    event = EventOutbox(event_type=event_type, data=data)
    session.add(event)
    session.flush()
    return event.id


def _publish_pending_events(engine: Engine) -> None:
    settings = get_settings()
    session_factory = create_session_factory(engine)
    with session_factory() as session:
        events = session.execute(
            select(EventOutbox.id, EventOutbox.event_type, EventOutbox.data, EventOutbox.created_at)
            .where(EventOutbox.published_at.is_(None))
            .order_by(EventOutbox.created_at)
            .limit(20)
        ).all()

    if not events:
        return

    producer = KafkaProducer(
        bootstrap_servers=[
            server.strip() for server in settings.kafka_bootstrap_servers.split(",") if server.strip()
        ],
        acks="all",
        retries=10,
        max_block_ms=5000,
        value_serializer=lambda value: json.dumps(value).encode("utf-8"),
    )
    try:
        for event_id, event_type, data, created_at in events:
            producer.send(
                settings.kafka_events_topic,
                key=str(event_id).encode("utf-8"),
                value={
                    "event_id": str(event_id),
                    "event_type": event_type,
                    "data": data,
                    "occurred_at": created_at.isoformat(),
                },
            ).get(timeout=5)
            with session_factory.begin() as session:
                session.execute(
                    update(EventOutbox)
                    .where(EventOutbox.id == event_id, EventOutbox.published_at.is_(None))
                    .values(published_at=datetime.now(timezone.utc))
                )
    finally:
        producer.close(timeout=5)


async def run_outbox_publisher(engine: Engine) -> None:
    while True:
        try:
            await asyncio.to_thread(_publish_pending_events, engine)
        except Exception:
            logger.exception("Kafka outbox publishing failed; pending events will be retried.")
        await asyncio.sleep(2)
