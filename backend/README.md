# CarYAAR backend

The backend is split into four independently runnable FastAPI services. All
services use MySQL by default and can use separate MySQL database URLs in
deployment.

> `root` / `root` is for local development only. The example database port is
> bound to this machine (`127.0.0.1`); do not expose the MySQL root account or
> reuse this password in production.

## Local setup

In PowerShell, from the `backend` directory:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Replace `JWT_SECRET_KEY` in `.env` with a random secret generated with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Start MySQL with Docker Compose:

```powershell
docker compose up -d mysql
```

The default development database URL is
`mysql+pymysql://root:root@127.0.0.1:3306/caryaar?charset=utf8mb4`. Compose
creates the database and waits for MySQL health checks before reporting the
container healthy.

Start the four backend services in separate PowerShell windows, from the
`backend` directory:

```powershell
python -m uvicorn main:app --app-dir auth-service --reload --port 8001
python -m uvicorn main:app --app-dir car_service --reload --port 8002
python -m uvicorn main:app --app-dir feedback_service --reload --port 8003
python -m uvicorn main:app --app-dir support_service --reload --port 8004
```

The car service creates four sample Audi listings the first time its listings
table is empty. Set `SEED_DUMMY_DATA=false` to disable sample data. Sample
listings are read-only because they are not owned by a registered account.
Registered CarYAAR account passwords are separate from the MySQL credentials
and must be at least 12 characters.

The car service accepts JPEG, PNG, and WebP photos up to 5 MB and 12 megapixels.
It verifies and re-encodes uploads, removes EXIF metadata, and gives each image
a random filename. Images are stored under `car_service/uploads` by default;
set `CAR_IMAGE_UPLOAD_DIR` to a persistent directory when deploying. Back up
this directory along with the database.

To enable Hugging Face support chat, set `HF_TOKEN` to a Hugging Face access
token with inference access. `HF_MODEL_ID` selects the inference model. Ticket
creation and feedback do not require an HF token.

Each service creates its own tables on startup. Interactive API documentation
is available at `http://localhost:<port>/docs`; `/health` checks the database
connection. Table creation is intended for this initial development backend;
use versioned schema migrations before production schema changes.

## Services and endpoints

All paths are prefixed with `/api/v1`.

| Service | Port | Endpoints |
| --- | ---: | --- |
| Authentication | 8001 | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Cars | 8002 | `GET /cars`, `GET /cars/mine`, `GET /cars/{id}`, `POST /cars`, `PUT /cars/{id}`, `DELETE /cars/{id}`, `POST /cars/{id}/image` |
| Feedback | 8003 | `POST /feedback` |
| Support | 8004 | `POST /support/tickets`, `POST /support/chat` |

Registration and login return a bearer token to API clients. The frontend keeps
this token in a same-origin, HttpOnly, Secure-in-production cookie and uses a
Next.js API proxy to call the four services. Listing creation, update, deletion,
and photo upload require an authenticated owner; public visitors can search and
view active cars. Car prices are stored in INR. Search supports `search`,
`fuel`, `location`, `min_price`, `max_price`, `offset`, and `limit`.

Feedback and support tickets are validated and stored in MySQL. The support
chat submits a request to Hugging Face Inference and stores the question and
answer. It returns `503` if `HF_TOKEN` is missing and `502` when model inference
fails. Before production, protect public support and feedback routes with API
gateway rate limits; use Redis if distributed limits are required.

Request bodies use Pydantic validation, including valid email addresses,
nonblank bounded text, allowed categories and car types, positive prices, and
bounded pagination. Invalid requests return FastAPI's standard `422` response.

## Frontend connection

In the `frontend` directory, copy `.env.local.example` to `.env.local` and set
the four API URLs if your service addresses differ:

```powershell
Copy-Item .env.local.example .env.local
npm run dev
```

The integrated marketplace loads and filters database listings, supports
registration and login, lets owners see and edit their listings, and connects
listing-photo uploads to the car service. Buyers can send an enquiry about a car
to CarYAAR support. The feedback and support forms submit to their respective
services, and support chat displays its Hugging Face response.

Kafka and Redis are not current runtime dependencies. Service-owned data and
versioned API boundaries leave room to introduce messaging, caching, or
distributed rate limiting when those features are needed.
