from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import get_db
from model import Notification
from schemas import NotificationResponse
from shared.security import get_current_user_id

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationResponse])
def list_notifications(
    unread_only: bool = False,
    limit: int = Query(default=50, ge=1, le=100),
    user_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db),
):
    statement = select(Notification).where(Notification.recipient_user_id == user_id)
    if unread_only:
        statement = statement.where(Notification.read_at.is_(None))
    return session.scalars(
        statement.order_by(Notification.created_at.desc()).limit(limit)
    ).all()


@router.get("/unread-count")
def unread_count(
    user_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db),
):
    count = session.scalar(
        select(func.count(Notification.id)).where(
            Notification.recipient_user_id == user_id,
            Notification.read_at.is_(None),
        )
    )
    return {"count": count or 0}


@router.post("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    session: Session = Depends(get_db),
):
    notification = session.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.recipient_user_id == user_id,
        )
    )
    if notification is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found"
        )
    if notification.read_at is None:
        notification.read_at = datetime.now(timezone.utc)
        session.commit()
        session.refresh(notification)
    return notification
