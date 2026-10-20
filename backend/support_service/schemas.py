from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class TicketCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    topic: Literal["buying", "selling", "account", "safety", "other"]
    message: str = Field(min_length=10, max_length=1200)

    @field_validator("name", "message")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field must not be blank")
        return value

    @field_validator("message")
    @classmethod
    def validate_message_length(cls, value: str) -> str:
        if len(value) < 10:
            raise ValueError("Message must contain at least 10 non-whitespace characters")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).lower()


class TicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    topic: str
    status: str
    created_at: datetime


class ChatRequest(BaseModel):
    message: str = Field(min_length=3, max_length=1200)

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Message must contain at least 3 non-whitespace characters")
        return value


class ChatResponse(BaseModel):
    id: UUID
    answer: str
    model: str
    created_at: datetime
