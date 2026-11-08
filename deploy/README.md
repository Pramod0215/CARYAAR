# Production deployment

The GitHub Actions workflow runs frontend linting, type-checking, and a
production build, plus the backend unit and integration tests, on pull requests
and pushes to `master`. A successful push to `master` builds and publishes the
frontend and five backend service images to GitHub Container Registry (GHCR),
then deploys that exact commit to the production VPS.

## VPS prerequisites

- A Linux VPS with Docker Engine and the Docker Compose plugin installed.
- A DNS `A`/`AAAA` record for the application domain pointing to the VPS.
- Inbound TCP ports 80 and 443 (and UDP 443 for HTTP/3) allowed by the host and
  cloud firewalls. Caddy obtains and renews HTTPS certificates automatically.
- The deployment SSH user can run Docker Compose and write to the deployment
  directory.

## GitHub environment

Create a GitHub Actions environment named `production`. Add these environment
secrets:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | VPS hostname or IP address |
| `VPS_USER` | SSH deployment user |
| `VPS_SSH_KEY` | Private key for that user |
| `VPS_SSH_KNOWN_HOSTS` | Verified SSH host-key entry for the VPS |
| `GHCR_READ_TOKEN` | GitHub personal access token with `read:packages` |

The workflow uses the repository owner as the GHCR username. Optionally add the
environment variable `VPS_DEPLOY_PATH`; it defaults to `/opt/caryaar`. Add the
required environment variable `DOMAIN` with the public DNS name configured for
the application.
Configure environment protection rules or required reviewers in GitHub if
production deployments need approval.

Add the VPS public host key to `VPS_SSH_KNOWN_HOSTS` only after verifying its
fingerprint through a trusted channel. Do not use an unverified `ssh-keyscan`
result as the trust anchor.

## VPS environment

Create the deployment directory and its `.env` file once. Keep this file on the
VPS; the workflow deliberately transfers only the Compose and Caddy
configuration and never overwrites secrets.

```dotenv
DOMAIN=caryaar.example.com
MYSQL_DATABASE=caryaar
MYSQL_USER=caryaar
MYSQL_PASSWORD=replace-with-a-long-random-hex-secret
MYSQL_ROOT_PASSWORD=replace-with-a-different-long-random-hex-secret
JWT_SECRET_KEY=replace-with-a-different-long-random-secret

# Optional integrations
HF_TOKEN=
NOTIFICATION_ADMIN_EMAIL=
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_USE_TLS=true
SMTP_USE_SSL=false
```

Generate distinct database and JWT secrets (for example with
`openssl rand -hex 32`). The application uses a dedicated MySQL account rather
than the root account. Restrict access to `.env` on the VPS, for example with
`chmod 600`.

The workflow supplies the image prefix and immutable commit tag during deploy.
Do not set `IMAGE_TAG` or `IMAGE_PREFIX` in `.env`. After the first push to
`master`, the workflow creates the target directory, uploads the deployment
configuration, pulls the images, and starts the stack. The first deployment
also requires the configured GHCR token to be able to read the private packages.

The stack publishes only Caddy's HTTP/HTTPS ports. MySQL, Kafka, and all APIs
remain on the private Compose network. MySQL, Kafka, uploaded car images, and
Caddy certificates use persistent Docker volumes; back up the database and
uploads volume as part of the VPS recovery plan.
