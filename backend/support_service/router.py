from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from huggingface_hub import InferenceClient
from huggingface_hub.errors import HfHubHTTPError, InferenceTimeoutError
from sqlalchemy.orm import Session

from database import get_db
from model import SupportChat, SupportTicket
from schemas import ChatRequest, ChatResponse, TicketCreate, TicketResponse
from shared.config import get_settings

router = APIRouter(prefix="/api/v1/support", tags=["support"])


@router.post("/tickets", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
def create_ticket(payload: TicketCreate, session: Session = Depends(get_db)):
    ticket = SupportTicket(**payload.model_dump())
    session.add(ticket)
    session.commit()
    session.refresh(ticket)
    return ticket


@router.post("/chat", response_model=ChatResponse)
def ask_support_bot(payload: ChatRequest, session: Session = Depends(get_db)):
    settings = get_settings()
    if not settings.hf_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Support chat is not configured. Set HF_TOKEN to enable it.",
        )

    try:
        result = InferenceClient(
            model=settings.hf_model_id,
            token=settings.hf_token,
        ).chat_completion(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are CarYAAR's automotive marketplace support assistant. "
                        "Give concise, practical guidance. Do not invent CarYAAR policies "
                        "or request passwords, one-time codes, or payment PINs. For account, "
                        "safety, payment, or unresolved issues, suggest contacting the human "
                        "support team instead of claiming to resolve them."
                    ),
                },
                {"role": "user", "content": payload.message},
            ],
            max_tokens=400,
            temperature=0.3,
        )
    except (HfHubHTTPError, InferenceTimeoutError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The support assistant is temporarily unavailable. Please try again.",
        ) from exc

    if not result.choices:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The support assistant returned no response. Please try again.",
        )
    answer = result.choices[0].message.content
    if not isinstance(answer, str) or not answer.strip():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The support assistant returned an empty response. Please try again.",
        )

    chat = SupportChat(
        question=payload.message,
        answer=answer.strip(),
        model=settings.hf_model_id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(chat)
    session.commit()
    session.refresh(chat)
    return ChatResponse(
        id=chat.id,
        answer=chat.answer,
        model=chat.model,
        created_at=chat.created_at,
    )