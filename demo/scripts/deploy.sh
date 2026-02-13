#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# OpenCALL Demo — Full Deployment Script
# Deploys all 4 subdomains to GCP:
#   - api.opencall-api.com  → Cloud Run  (demo/api)
#   - app.opencall-api.com  → Cloud Run  (demo/app)
#   - www.opencall-api.com  → Firebase Hosting (demo/www)
#   - agents.opencall-api.com → Firebase Hosting (demo/agents)
# ============================================================================

# ---------------------------------------------------------------------------
# Configuration — override via environment or .env
# ---------------------------------------------------------------------------
PROJECT_ID="${GCS_PROJECT_ID:?Set GCS_PROJECT_ID}"
REGION="${CLOUD_RUN_REGION:-australia-southeast1}"
GCS_BUCKET="${GCS_BUCKET:?Set GCS_BUCKET}"
ADMIN_SECRET="${ADMIN_SECRET:?Set ADMIN_SECRET}"
COOKIE_SECRET="${COOKIE_SECRET:?Set COOKIE_SECRET}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_IMAGE="gcr.io/${PROJECT_ID}/opencall-demo-api"
APP_IMAGE="gcr.io/${PROJECT_ID}/opencall-demo-app"

echo "==> Project: ${PROJECT_ID}  Region: ${REGION}"
echo "==> Repo root: ${REPO_ROOT}"
echo ""

# ---------------------------------------------------------------------------
# 1. Build & deploy API to Cloud Run (api.opencall-api.com)
# ---------------------------------------------------------------------------
echo "--- Building API image ---"
gcloud builds submit "${REPO_ROOT}/api" \
  --tag "${API_IMAGE}" \
  --project "${PROJECT_ID}" \
  --quiet

echo "--- Deploying API to Cloud Run ---"
gcloud run deploy opencall-demo-api \
  --image "${API_IMAGE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --set-env-vars "GCS_BUCKET=${GCS_BUCKET},GCS_PROJECT_ID=${PROJECT_ID},ADMIN_SECRET=${ADMIN_SECRET},PORT=8080" \
  --quiet

API_URL="$(gcloud run services describe opencall-demo-api \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format 'value(status.url)')"

echo "==> API deployed at: ${API_URL}"
echo ""

# ---------------------------------------------------------------------------
# 2. Build & deploy App to Cloud Run (app.opencall-api.com)
# ---------------------------------------------------------------------------
echo "--- Building App image ---"
gcloud builds submit "${REPO_ROOT}/app" \
  --tag "${APP_IMAGE}" \
  --project "${PROJECT_ID}" \
  --quiet

echo "--- Deploying App to Cloud Run ---"
gcloud run deploy opencall-demo-app \
  --image "${APP_IMAGE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --set-env-vars "API_URL=${API_URL},COOKIE_SECRET=${COOKIE_SECRET},PORT=8080,AGENTS_URL=https://agents.opencall-api.com" \
  --quiet

APP_URL="$(gcloud run services describe opencall-demo-app \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format 'value(status.url)')"

echo "==> App deployed at: ${APP_URL}"
echo ""

# ---------------------------------------------------------------------------
# 3. Deploy brochure site to Firebase Hosting (www.opencall-api.com)
# ---------------------------------------------------------------------------
echo "--- Deploying brochure site (www) to Firebase Hosting ---"
cd "${REPO_ROOT}/www"

# Build static assets if a build script exists
if [ -f package.json ] && grep -q '"build"' package.json; then
  bun install
  bun run build
fi

firebase deploy \
  --only hosting:www \
  --project "${PROJECT_ID}" \
  --non-interactive

echo "==> Brochure site deployed to www.opencall-api.com"
echo ""

# ---------------------------------------------------------------------------
# 4. Deploy agents site to Firebase Hosting (agents.opencall-api.com)
# ---------------------------------------------------------------------------
echo "--- Deploying agents site to Firebase Hosting ---"
cd "${REPO_ROOT}/agents"

# Build static assets if a build script exists
if [ -f package.json ] && grep -q '"build"' package.json; then
  bun install
  bun run build
fi

firebase deploy \
  --only hosting:agents \
  --project "${PROJECT_ID}" \
  --non-interactive

echo "==> Agents site deployed to agents.opencall-api.com"
echo ""

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo "============================================"
echo " Deployment complete!"
echo ""
echo "  API:     https://api.opencall-api.com"
echo "  App:     https://app.opencall-api.com"
echo "  WWW:     https://www.opencall-api.com"
echo "  Agents:  https://agents.opencall-api.com"
echo "============================================"
