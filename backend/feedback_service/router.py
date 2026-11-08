from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from database import get_db
from model import Feedback
from schemas import FeedbackCreate, FeedbackResponse
from shared.events import enqueue_event

router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
def submit_feedback(payload: FeedbackCreate, session: Session = Depends(get_db)):
    feedback = Feedback(**payload.model_dump())
    session.add(feedback)
    session.flush()
    enqueue_event(
        session,
        "feedback.submitted",
        {
            "feedback_id": str(feedback.id),
            "rating": feedback.rating,
            "category": feedback.category,
            "message": feedback.message,
        },
    )
    session.commit()
    session.refresh(feedback)
    return feedback