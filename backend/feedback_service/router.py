from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from database import get_db
from model import Feedback
from schemas import FeedbackCreate, FeedbackResponse

router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
def submit_feedback(payload: FeedbackCreate, session: Session = Depends(get_db)):
    feedback = Feedback(**payload.model_dump())
    session.add(feedback)
    session.commit()
    session.refresh(feedback)
    return feedback