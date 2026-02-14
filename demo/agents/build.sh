#!/usr/bin/env bash
set -euo pipefail

# Build the agents site: replace template placeholders and copy to dist/
# Usage: API_URL=https://... bash build.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST="${SCRIPT_DIR}/dist"

API_URL="${API_URL:?Set API_URL}"

echo "--- Building agents site ---"
echo "    API_URL: ${API_URL}"

rm -rf "${DIST}"
mkdir -p "${DIST}"

# Replace template placeholders in index.md
sed -e "s|{{API_URL}}|${API_URL}|g" \
    "${SCRIPT_DIR}/index.md" > "${DIST}/index.md"

echo "==> agents site built to ${DIST}"
