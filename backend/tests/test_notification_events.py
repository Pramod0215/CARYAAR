import sys
import unittest
from pathlib import Path
from uuid import uuid4

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "notification_service"))

from processor import build_notification


class NotificationEventTests(unittest.TestCase):
    def test_account_event_creates_user_and_email_notification(self):
        user_id = uuid4()
        notification = build_notification(
            {
                "event_id": str(uuid4()),
                "event_type": "account.registered",
                "data": {
                    "user_id": str(user_id),
                    "name": "CarYAAR User",
                    "email": "user@example.com",
                },
            },
            admin_email=None,
        )

        self.assertEqual(notification.recipient_user_id, user_id)
        self.assertEqual(notification.recipient_email, "user@example.com")
        self.assertEqual(notification.email_status, "pending")
        self.assertIn("CarYAAR User", notification.message)

    def test_feedback_and_support_events_route_to_admin_email(self):
        feedback = build_notification(
            {
                "event_id": str(uuid4()),
                "event_type": "feedback.submitted",
                "data": {
                    "rating": 5,
                    "category": "overall",
                    "message": "A useful marketplace.",
                },
            },
            admin_email="admin@example.com",
        )
        ticket = build_notification(
            {
                "event_id": str(uuid4()),
                "event_type": "support.ticket_created",
                "data": {
                    "name": "Customer",
                    "email": "customer@example.com",
                    "topic": "buying",
                    "message": "I need help with a listing.",
                },
            },
            admin_email="admin@example.com",
        )

        self.assertEqual(feedback.recipient_email, "admin@example.com")
        self.assertEqual(ticket.recipient_email, "admin@example.com")
        self.assertIn("A useful marketplace.", feedback.message)
        self.assertIn("Customer", ticket.message)

    def test_unsupported_event_is_ignored_and_malformed_event_fails(self):
        self.assertIsNone(
            build_notification(
                {"event_id": str(uuid4()), "event_type": "unknown.event", "data": {}},
                admin_email=None,
            )
        )
        with self.assertRaises(ValueError):
            build_notification(
                {"event_id": str(uuid4()), "event_type": "account.registered", "data": {}},
                admin_email=None,
            )


if __name__ == "__main__":
    unittest.main()
