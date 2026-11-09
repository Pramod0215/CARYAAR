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

## Kubernetes deployment

The manifests in [`kubernetes/`](./kubernetes/) provide an alternative to the
Compose deployment: five backend services, the frontend, single-node MySQL and
Kafka, and persistent claims for database data, Kafka data, and car uploads.
The existing GitHub Actions workflow continues to deploy Compose to the VPS;
Kubernetes deployments are applied manually.

The cluster must have a default `StorageClass` and support `LoadBalancer`
services for automatic frontend exposure. The frontend service can still be
accessed with `kubectl port-forward` on clusters without a load balancer; use an
Ingress controller and TLS configuration separately when needed.

Before deploying:

1. Make sure the images from the GitHub Actions workflow have been published.
   The manifests default to the `latest` tag; for a release, set every
   `newTag` in `kubernetes/kustomization.yaml` to the same `sha-<commit>` tag.
2. Set `FRONTEND_ORIGINS` in `kubernetes/config.yaml` to the browser-visible
   origin for your deployment.
3. Create the namespace and a private env file named `.env.kubernetes` with
   the following keys. Generate distinct random values for the passwords and
   JWT key; use a hex database password so it is safe in the database URL.
   Keep this file out of source control.

```dotenv
mysql-database=caryaar
mysql-user=caryaar
mysql-password=<random-hex-database-password>
mysql-root-password=<different-random-hex-root-password>
database-url=mysql+pymysql://caryaar:<random-hex-database-password>@mysql:3306/caryaar?charset=utf8mb4
jwt-secret-key=<random-secret-at-least-32-characters>
```

Add `hf-token` and `smtp-password` to the env file if those integrations are
used. For production, provision the secret through your cluster's secret
manager rather than keeping it in a local file.

From the repository root, create the secret and deploy:

```powershell
kubectl create namespace caryaar
kubectl create secret generic caryaar-secrets --namespace caryaar --from-env-file=.env.kubernetes
kubectl apply -k deploy/kubernetes
kubectl rollout status statefulset/mysql --namespace caryaar
kubectl rollout status statefulset/kafka --namespace caryaar
kubectl get pods,services --namespace caryaar
```

If GHCR packages are private, create and attach an image-pull secret before
applying the manifests. Use a GitHub token with `read:packages` access; replace
the placeholder securely and do not save the token in shell history:

```powershell
kubectl create secret docker-registry ghcr-pull --namespace caryaar --docker-server=ghcr.io --docker-username=YOUR_GITHUB_USERNAME --docker-password=YOUR_READ_PACKAGES_TOKEN
kubectl patch serviceaccount default --namespace caryaar --type merge --patch '{"imagePullSecrets":[{"name":"ghcr-pull"}]}'
```

To access the frontend without a provisioned load balancer, run
`kubectl port-forward service/frontend 3000:80 --namespace caryaar` and open
`http://localhost:3000`.

These manifests run MySQL and Kafka as single replicas; they are not
high-availability configurations. Back up persistent data and use managed
database and Kafka services or a production-grade operator for workloads that
require high availability.
