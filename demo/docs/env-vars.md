# Environment Variables

All environment variables used by the OpenCALL Demo services.

Bun automatically loads `.env` files, so no dotenv package is needed.

---

## API Service (`demo/api`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `8080` | HTTP port the API server listens on |
| `DATABASE_PATH` | No | `./library.db` | Path to the SQLite database file |
| `GCS_BUCKET` | **Yes** | -- | Google Cloud Storage bucket name for cover images |
| `GCS_PROJECT_ID` | **Yes** | -- | GCP project ID (used for GCS and Cloud Run) |
| `ADMIN_SECRET` | **Yes** | -- | Shared secret for the `POST /admin/reset` endpoint. Must match the value configured in Cloud Scheduler |
| `CALL_VERSION` | No | `2026-02-10` | OpenCALL API version string returned in responses |

---

## App Service (`demo/app`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` / `APP_PORT` | No | `3000` | HTTP port the App server listens on. `APP_PORT` takes precedence if both are set |
| `API_URL` | **Yes** | -- | Internal URL of the API service (e.g. the Cloud Run service URL) |
| `SESSION_DB_PATH` | No | `./sessions.db` | Path to the SQLite database used for session storage |
| `COOKIE_SECRET` | **Yes** | -- | Secret key used for signing session cookies. Use a random string of at least 32 characters |
| `AGENTS_URL` | No | `https://agents.opencall-api.com` | Base URL for the agents documentation site, used to build links in the UI |

---

## Deployment / Scripts

These variables are consumed by the deploy scripts in `demo/scripts/`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `GCS_PROJECT_ID` | **Yes** | -- | GCP project ID (same as API) |
| `GCS_BUCKET` | **Yes** | -- | GCS bucket name (same as API) |
| `ADMIN_SECRET` | **Yes** | -- | Admin secret (same as API) |
| `COOKIE_SECRET` | **Yes** | -- | Cookie secret (same as App) |
| `CLOUD_RUN_REGION` | No | `australia-southeast1` | GCP region for Cloud Run and Cloud Scheduler |

---

## Example `.env` file

```env
# API
GCS_BUCKET=opencall-demo-covers
GCS_PROJECT_ID=my-gcp-project
ADMIN_SECRET=change-me-to-a-real-secret
CALL_VERSION=2026-02-10

# App
API_URL=http://localhost:8080
COOKIE_SECRET=change-me-to-a-32-char-secret-key
AGENTS_URL=http://localhost:5173

# Deploy
CLOUD_RUN_REGION=australia-southeast1
```
