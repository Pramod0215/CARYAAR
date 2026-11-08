from uuid import UUID

from model import Notification


def _required_text(data: dict[str, object], key: str) -> str:
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ValueError(f"Event data requires a non-empty {key}")
    text = str(value).strip()
    if not text:
        raise ValueError(f"Event data requires a non-empty {key}")
    return text


def build_notification(
    event: dict[str, object], admin_email: str | None
) -> Notification | None:
    event_id = UUID(_required_text(event, "event_id"))
    event_type = _required_text(event, "event_type")
    data = event.get("data")
    if not isinstance(data, dict):
        raise ValueError("Event data must be an object")

    if event_type == "account.registered":
        name = _required_text(data, "name")
        recipient_email = _required_text(data, "email")
        return Notification(
            event_id=event_id,
            event_type=event_type,
            recipient_user_id=UUID(_required_text(data, "user_id")),
            recipient_email=recipient_email,
            title="Welcome to CarYAAR",
            message=f"Welcome, {name}! Your CarYAAR account is ready.",
            email_status="pending",
        )

    if event_type == "car.listing_created":
        make = _required_text(data, "make")
        model = _required_text(data, "model")
        listing_id = _required_text(data, "listing_id")
        return Notification(
            event_id=event_id,
            event_type=event_type,
            recipient_user_id=UUID(_required_text(data, "owner_id")),
            title="Your car listing is live",
            message=f"Your {make} {model} listing ({listing_id}) was created.",
        )

    if event_type == "feedback.submitted":
        rating = _required_text(data, "rating")
        category = _required_text(data, "category")
        message = _required_text(data, "message")
        return Notification(
            event_id=event_id,
            event_type=event_type,
            recipient_email=admin_email,
            title="New CarYAAR feedback",
            message=f"New {category} feedback ({rating}/5):\n\n{message}",
            email_status="pending" if admin_email else "not_configured",
            email_error=None if admin_email else "NOTIFICATION_ADMIN_EMAIL is not configured",
        )

    if event_type == "support.ticket_created":
        name = _required_text(data, "name")
        email = _required_text(data, "email")
        topic = _required_text(data, "topic")
        message = _required_text(data, "message")
        return Notification(
            event_id=event_id,
            event_type=event_type,
            recipient_email=admin_email,
            title="New CarYAAR support ticket",
            message=f"New {topic} ticket from {name} ({email}):\n\n{message}",
            email_status="pending" if admin_email else "not_configured",
            email_error=None if admin_email else "NOTIFICATION_ADMIN_EMAIL is not configured",
        )

    return None
