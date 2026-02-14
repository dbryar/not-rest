#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# OpenCALL Demo — Full Deployment Script
# Deploys all 4 services to GCP project "opencall-api":
#   - opencall-api   → Cloud Run  (demo/api)
#   - opencall-app   → Cloud Run  (demo/app)
#   - opencall-web   → Firebase Hosting (demo/www)
#   - opencall-agent → Firebase Hosting (demo/agents)
# ============================================================================

# ---------------------------------------------------------------------------
# Configuration — override via environment or .env file in demo/
# ---------------------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Load .env if present (does not override existing env vars)
if [ -f "${REPO_ROOT}/.env" ]; then
  set -a
  source "${REPO_ROOT}/.env"
  set +a
fi

PROJECT_ID="${GCS_PROJECT_ID:-opencall-api}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
GCS_BUCKET="${GCS_BUCKET:-opencall-demo-covers}"

# Fetch secrets from GCP Secret Manager if not already set
if [ -z "${ADMIN_SECRET:-}" ]; then
  echo "--- Fetching ADMIN_SECRET from Secret Manager ---"
  ADMIN_SECRET="$(gcloud secrets versions access latest \
    --secret=ADMIN_SECRET --project="${PROJECT_ID}")"
fi
if [ -z "${COOKIE_SECRET:-}" ]; then
  echo "--- Fetching COOKIE_SECRET from Secret Manager ---"
  COOKIE_SECRET="$(gcloud secrets versions access latest \
    --secret=COOKIE_SECRET --project="${PROJECT_ID}")"
fi

echo "==> Project: ${PROJECT_ID}  Region: ${REGION}"
echo "==> Repo root: ${REPO_ROOT}"
echo ""

# ---------------------------------------------------------------------------
# 1. Deploy API to Cloud Run
# ---------------------------------------------------------------------------
echo "--- Deploying API to Cloud Run ---"
gcloud run deploy opencall-api \
  --source "${REPO_ROOT}/api" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --allow-unauthenticated \
  --port 8080 \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --set-env-vars "GCS_BUCKET=${GCS_BUCKET},GCS_PROJECT_ID=${PROJECT_ID},ADMIN_SECRET=${ADMIN_SECRET}" \
  --quiet

API_URL="$(gcloud run services describe opencall-api \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format 'value(status.url)')"

echo "==> API deployed at: ${API_URL}"
echo ""

# ---------------------------------------------------------------------------
# 2. Deploy App to Cloud Run (needs API_URL from step 1)
# ---------------------------------------------------------------------------
echo "--- Deploying App to Cloud Run ---"
gcloud run deploy opencall-app \
  --source "${REPO_ROOT}/app" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --allow-unauthenticated \
  --port 8080 \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --set-env-vars "API_URL=${API_URL},COOKIE_SECRET=${COOKIE_SECRET},AGENTS_URL=${AGENTS_URL:-https://agents.opencall-api.com},WWW_URL=${WWW_URL:-https://www.opencall-api.com}" \
  --quiet

APP_URL="$(gcloud run services describe opencall-app \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format 'value(status.url)')"

echo "==> App deployed at: ${APP_URL}"
echo ""

# Update API with the now-known APP_URL
echo "--- Updating API with APP_URL ---"
gcloud run services update opencall-api \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --update-env-vars "APP_URL=${APP_URL}" \
  --quiet

echo ""

# ---------------------------------------------------------------------------
# 3. Build static sites (template replacement → dist/)
# ---------------------------------------------------------------------------
echo "--- Building static sites ---"
APP_URL="${APP_URL}" API_URL="${API_URL}" bash "${REPO_ROOT}/www/build.sh"
API_URL="${API_URL}" bash "${REPO_ROOT}/agents/build.sh"
echo ""

# ---------------------------------------------------------------------------
# 4. Deploy both hosting sites from demo/ directory
# ---------------------------------------------------------------------------
echo "--- Deploying to Firebase Hosting ---"
cd "${REPO_ROOT}"
firebase deploy \
  --only hosting \
  --project "${PROJECT_ID}" \
  --non-interactive

echo ""

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo "============================================"
echo " Deployment complete!"
echo ""
echo "  API:     ${API_URL}"
echo "  App:     ${APP_URL}"
echo "  WWW:     ${WWW_URL:-https://www.opencall-api.com}"
echo "  Agents:  ${AGENTS_URL:-https://agents.opencall-api.com}"
echo "============================================"
