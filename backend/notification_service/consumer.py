import asyncio
from datetime import datetime, timezone
from email.message import EmailMessage
import json
import logging
import smtplib
import ssl
from threading import Event

from kafka import KafkaConsumer
from kafka.errors import KafkaError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.engine import Engine

from database import engine
from model import Notification
from processor import build_notification
from shared.config import get_settings
from shared.database import create_session_factory

logger = logging.getLogger(__name__)


def _store_event(session_factory, event: dict[str, object]) -> None:
    settings = get_settings()
    notification = build_notification(event, settings.notification_admin_email)
    if notification is None:
        logger.info("Ignoring unsupported Kafka event type: %s", event.get("event_type"))
        return

    with session_factory() as session:
        if session.scalar(
            select(Notification.id).where(Notification.event_id == notification.event_id)
        ):
            return
        session.add(notification)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            if session.scalar(
                select(Notification.id).where(Notification.event_id == notification.event_id)
            ):
                return
            raise


def _consume_events(stop_event: Event) -> None:
    settings = get_settings()
    bootstrap_servers = [
        server.strip() for server in settings.kafka_bootstrap_servers.split(",") if server.strip()
    ]
    session_factory = create_session_factory(engine)
    consumer = None
    while not stop_event.is_set():
        try:
            if consumer is None:
                consumer = KafkaConsumer(
                    settings.kafka_events_topic,
                    bootstrap_servers=bootstrap_servers,
                    group_id=settings.kafka_notifications_group,
                    enable_auto_commit=False,
                    auto_offset_reset="earliest",
                    consumer_timeout_ms=1000,
                )
            records = consumer.poll(timeout_ms=1000, max_records=1)
            for partition, messages in records.items():
                for message in messages:
                    try:
                        event = json.loads(message.value.decode("utf-8"))
                        if not isinstance(event, dict):
                            raise ValueError("Kafka event must be a JSON object")
                        _store_event(session_factory, event)
                        consumer.commit()
                    except Exception:
                        consumer.seek(partition, message.offset)
                        raise
        except KafkaError:
            logger.exception("Kafka notification consumer failed; reconnecting.")
            if consumer is not None:
                consumer.close()
                consumer = None
            stop_event.wait(5)
        except Exception:
            logger.exception("Failed to process a Kafka notification event; it will be retried.")
            stop_event.wait(2)
    if consumer is not None:
        consumer.close()


def _send_email(recipient: str, subject: str, body: str) -> None:
    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_from_email:
        raise RuntimeError("SMTP_HOST and SMTP_FROM_EMAIL are required for email delivery")

    message = EmailMessage()
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)

    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(
            settings.smtp_host,
            settings.smtp_port,
            timeout=15,
            context=ssl.create_default_context(),
        ) as server:
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password or "")
            server.send_message(message)
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        if settings.smtp_use_tls:
            server.starttls(context=ssl.create_default_context())
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password or "")
        server.send_message(message)


def _retry_pending_emails(engine: Engine) -> None:
    settings = get_settings()
    session_factory = create_session_factory(engine)
    with session_factory() as session:
        notifications = session.scalars(
            select(Notification)
            .where(Notification.email_status.in_(("pending", "failed", "not_configured")))
            .order_by(Notification.created_at)
            .limit(50)
        ).all()
        notification_ids = [notification.id for notification in notifications]

    for notification_id in notification_ids:
        with session_factory() as session:
            notification = session.get(Notification, notification_id)
            if notification is None or notification.email_sent_at is not None:
                continue
            if notification.event_type in {"feedback.submitted", "support.ticket_created"}:
                notification.recipient_email = (
                    notification.recipient_email or settings.notification_admin_email
                )
            if not notification.recipient_email:
                notification.email_status = "not_configured"
                notification.email_error = "No recipient email is configured for this event"
                session.commit()
                continue
            if not settings.smtp_host or not settings.smtp_from_email:
                notification.email_status = "not_configured"
                notification.email_error = "SMTP_HOST and SMTP_FROM_EMAIL are required"
                session.commit()
                continue
            recipient = notification.recipient_email
            subject = notification.title
            body = notification.message
            notification.email_attempts += 1
            session.commit()
        try:
            _send_email(recipient, subject, body)
        except Exception as exc:
            with session_factory() as session:
                notification = session.get(Notification, notification_id)
                if notification is None:
                    continue
                notification.email_status = "failed"
                notification.email_error = str(exc)
                session.commit()
            logger.exception("Email delivery failed for notification %s", notification_id)
        else:
            with session_factory() as session:
                notification = session.get(Notification, notification_id)
                if notification is None:
                    continue
                notification.email_status = "sent"
                notification.email_error = None
                notification.email_sent_at = datetime.now(timezone.utc)
                session.commit()


async def run_email_retry(engine: Engine) -> None:
    while True:
        try:
            await asyncio.to_thread(_retry_pending_emails, engine)
        except Exception:
            logger.exception("Email notification retry failed.")
        await asyncio.sleep(30)


def run_notification_consumer(stop_event: Event) -> None:
    _consume_events(stop_event)
