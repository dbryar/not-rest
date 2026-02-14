#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# OpenCALL Demo — One-Time Setup
# Run once before first deploy to configure GCP and Firebase resources.
# ============================================================================

PROJECT_ID="${GCS_PROJECT_ID:-opencall-api}"

echo "==> Setting up project: ${PROJECT_ID}"
echo ""

# ---------------------------------------------------------------------------
# 1. Enable required GCP APIs
# ---------------------------------------------------------------------------
echo "--- Enabling GCP APIs ---"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  --project "${PROJECT_ID}"

echo ""

# ---------------------------------------------------------------------------
# 2. Create secrets in Secret Manager (if they don't exist)
# ---------------------------------------------------------------------------
echo "--- Setting up secrets ---"
for SECRET_NAME in ADMIN_SECRET COOKIE_SECRET; do
  if gcloud secrets describe "${SECRET_NAME}" --project "${PROJECT_ID}" &>/dev/null; then
    echo "    ${SECRET_NAME} already exists (OK)"
  else
    echo "    Creating ${SECRET_NAME}..."
    # Generate a random 32-char secret
    VALUE="$(openssl rand -base64 32)"
    printf '%s' "${VALUE}" | gcloud secrets create "${SECRET_NAME}" \
      --project "${PROJECT_ID}" \
      --data-file=- \
      --replication-policy=automatic
    echo "    ${SECRET_NAME} created with auto-generated value"
  fi
done

echo ""

# ---------------------------------------------------------------------------
# 3. Create Firebase Hosting sites
# ---------------------------------------------------------------------------
echo "--- Creating Firebase Hosting sites ---"
firebase hosting:sites:create opencall-web --project "${PROJECT_ID}" 2>/dev/null || \
  echo "    Site opencall-web already exists (OK)"
firebase hosting:sites:create opencall-agent --project "${PROJECT_ID}" 2>/dev/null || \
  echo "    Site opencall-agent already exists (OK)"

echo ""

# ---------------------------------------------------------------------------
# 4. Apply hosting targets (writes to .firebaserc)
# ---------------------------------------------------------------------------
echo "--- Applying hosting targets ---"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_ROOT}"
firebase target:apply hosting www opencall-web --project "${PROJECT_ID}"
firebase target:apply hosting agents opencall-agent --project "${PROJECT_ID}"

echo ""

# ---------------------------------------------------------------------------
# 5. Create GCS bucket for cover images
# ---------------------------------------------------------------------------
echo "--- Creating GCS bucket ---"
gcloud storage buckets create gs://opencall-demo-covers \
  --project "${PROJECT_ID}" \
  --location us-central1 \
  2>/dev/null || echo "    Bucket already exists (OK)"

echo ""
echo "==> Setup complete. You can now run: bash scripts/deploy.sh"
