#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# OpenCALL Demo — Cloud Scheduler Setup
# Creates a scheduled job to reset the demo database every 4 hours.
#
# Target:  POST https://api.opencall-api.com/admin/reset
# Cron:    0 */4 * * *   (every 4 hours on the hour)
# Auth:    Authorization: Bearer {ADMIN_SECRET}
# Retry:   1 retry, 60s backoff
# ============================================================================

PROJECT_ID="${GCS_PROJECT_ID:?Set GCS_PROJECT_ID}"
REGION="${CLOUD_RUN_REGION:-australia-southeast1}"
ADMIN_SECRET="${ADMIN_SECRET:?Set ADMIN_SECRET}"

JOB_NAME="opencall-demo-db-reset"
SCHEDULE="0 */4 * * *"
TARGET_URL="https://api.opencall-api.com/admin/reset"
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
