from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Category = Literal["overall", "buying", "selling", "account", "idea"]


class FeedbackCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    category: Category = "overall"
    message: str = Field(min_length=10, max_length=1500)
    recommendation: int = Field(ge=0, le=10)
    email: EmailStr | None = None

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 10:
            raise ValueError("Message must contain at least 10 non-whitespace characters")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr | None) -> str | None:
        return str(value).lower() if value else None


class FeedbackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    rating: int
    category: str
    message: str
    recommendation: int
    created_at: datetime
