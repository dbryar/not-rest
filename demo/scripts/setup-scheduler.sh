#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# OpenCALL Demo — Cloud Scheduler Setup
# Creates a scheduled job to reset the demo database every 4 hours.
#
# Target:  POST <cloud-run-api-url>/admin/reset
# Cron:    0 */4 * * *   (every 4 hours on the hour)
# Auth:    Authorization: Bearer {ADMIN_SECRET}
# Retry:   1 retry, 60s backoff
# ============================================================================

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Load .env if present
if [ -f "${REPO_ROOT}/.env" ]; then
  set -a
  source "${REPO_ROOT}/.env"
  set +a
fi

PROJECT_ID="${GCS_PROJECT_ID:-opencall-api}"
REGION="${CLOUD_RUN_REGION:-us-central1}"

# Fetch secret from GCP Secret Manager if not already set
if [ -z "${ADMIN_SECRET:-}" ]; then
  echo "--- Fetching ADMIN_SECRET from Secret Manager ---"
  ADMIN_SECRET="$(gcloud secrets versions access latest \
    --secret=ADMIN_SECRET --project="${PROJECT_ID}")"
fi

# Resolve the Cloud Run API URL dynamically
API_URL="${API_URL:-$(gcloud run services describe opencall-api \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format 'value(status.url)' 2>/dev/null || echo "")}"

if [ -z "${API_URL}" ]; then
  echo "ERROR: Could not resolve API URL. Deploy the API first or set API_URL." >&2
  exit 1
fi

JOB_NAME="opencall-demo-db-reset"
SCHEDULE="0 */4 * * *"
TARGET_URL="${API_URL}/admin/reset"
TIME_ZONE="UTC"

echo "==> Creating Cloud Scheduler job: ${JOB_NAME}"
echo "    Schedule : ${SCHEDULE} (${TIME_ZONE})"
echo "    Target   : POST ${TARGET_URL}"
echo "    Retry    : 1 attempt, 60s backoff"
echo ""

# Delete the existing job if it already exists (idempotent re-run)
if gcloud scheduler jobs describe "${JOB_NAME}" \
  --project "${PROJECT_ID}" \
  --location "${REGION}" \
  &>/dev/null; then
  echo "--- Deleting existing job ---"
  gcloud scheduler jobs delete "${JOB_NAME}" \
    --project "${PROJECT_ID}" \
    --location "${REGION}" \
    --quiet
fi

# Create the scheduled job
gcloud scheduler jobs create http "${JOB_NAME}" \
  --project "${PROJECT_ID}" \
  --location "${REGION}" \
  --schedule "${SCHEDULE}" \
  --time-zone "${TIME_ZONE}" \
  --uri "${TARGET_URL}" \
  --http-method POST \
  --headers "Authorization=Bearer ${ADMIN_SECRET},Content-Type=application/json" \
  --attempt-deadline 60s \
  --max-retry-attempts 1 \
  --min-backoff 60s \
  --max-backoff 60s \
  --quiet

echo ""
echo "==> Cloud Scheduler job created successfully."
echo ""

# Optionally trigger the job immediately to verify it works
read -r -p "Run the job now to verify? [y/N] " REPLY
if [[ "${REPLY}" =~ ^[Yy]$ ]]; then
  echo "--- Triggering job ---"
  gcloud scheduler jobs run "${JOB_NAME}" \
    --project "${PROJECT_ID}" \
    --location "${REGION}"
  echo "==> Job triggered. Check logs for result."
fi
