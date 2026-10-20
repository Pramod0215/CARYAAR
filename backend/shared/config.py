from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "mysql+pymysql://root:root@127.0.0.1:3306/caryaar?charset=utf8mb4"
    auth_database_url: str | None = None
    car_database_url: str | None = None
    feedback_database_url: str | None = None
    support_database_url: str | None = None
    jwt_secret_key: str = Field(min_length=32)
    access_token_expire_minutes: int = 60
    frontend_origins: str = "http://localhost:3000"
    hf_token: str | None = None
    hf_model_id: str = "Qwen/Qwen2.5-7B-Instruct"
    seed_dummy_data: bool = True
    car_image_upload_dir: str | None = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("access_token_expire_minutes")
    @classmethod
    def validate_token_lifetime(cls, value: int) -> int:
        if value < 1:
            raise ValueError("access_token_expire_minutes must be positive")
        return value

    def database_url_for(self, service: str) -> str:
        service_url = getattr(self, f"{service}_database_url", None)
        return service_url or self.database_url

    def car_image_directory(self) -> Path:
        if self.car_image_upload_dir:
            return Path(self.car_image_upload_dir)
        return Path(__file__).resolve().parents[1] / "car_service" / "uploads"

    @property
    def allowed_frontend_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
