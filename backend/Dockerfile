FROM python:3.12-slim

ARG SERVICE
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend

WORKDIR /app/backend
COPY requirements.txt ./
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY . ./
RUN case "$SERVICE" in \
      auth-service|car_service|feedback_service|support_service|notification_service) ;; \
      *) echo "Unsupported SERVICE: $SERVICE" >&2; exit 1 ;; \
    esac \
    && mkdir -p /app/backend/car_service/uploads \
    && useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app/backend

WORKDIR /app/backend/${SERVICE}
USER appuser
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
