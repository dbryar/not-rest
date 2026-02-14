#!/usr/bin/env bash
set -euo pipefail

# Build the brochure site: replace template placeholders and copy to dist/
# Usage: APP_URL=https://... API_URL=https://... bash build.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST="${SCRIPT_DIR}/dist"

APP_URL="${APP_URL:?Set APP_URL}"
API_URL="${API_URL:?Set API_URL}"

echo "--- Building www site ---"
echo "    APP_URL: ${APP_URL}"
echo "    API_URL: ${API_URL}"

rm -rf "${DIST}"
mkdir -p "${DIST}"

# Replace template placeholders in index.html
sed -e "s|{{APP_URL}}|${APP_URL}|g" \
    -e "s|{{API_URL}}|${API_URL}|g" \
    "${SCRIPT_DIR}/index.html" > "${DIST}/index.html"

# Copy static assets
cp "${SCRIPT_DIR}/style.css" "${DIST}/style.css"
if [ -d "${SCRIPT_DIR}/assets" ]; then
  cp -r "${SCRIPT_DIR}/assets" "${DIST}/assets"
fi

echo "==> www site built to ${DIST}"
