#!/usr/bin/env bash
set -euo pipefail

fail() { echo "[install] ERROR: $*" >&2; exit 1; }
info() { echo "[install] $*"; }

if [ ! -f .env ]; then
  fail ".env not found. Copy .env.example to .env and fill in required values."
fi

# Load .env (export variables). Supports simple KEY=VALUE lines; ignores comments/blank lines.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

missing=()
require() {
  local name="$1"
  local val="${!name-}"
  if [ -z "${val}" ]; then
    missing+=("$name")
  fi
}

# Required vars (core stack)
for v in \
  SITE_DOMAIN ACME_EMAIL BASIC_AUTH_USER BASIC_AUTH_HASH \
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL \
  MINIO_ROOT_USER MINIO_ROOT_PASSWORD \
  S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_REGION \
  NEXTAUTH_SECRET NEXTAUTH_URL \
  PAYMENT_PROVIDER PAYMENTS_WEBHOOK_SECRET; do
  require "$v"
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "[install] ERROR: missing required environment variables:" >&2
  for m in "${missing[@]}"; do echo "  - $m" >&2; done
  exit 1
fi

# Sanity checks
if [ "${#NEXTAUTH_SECRET}" -lt 32 ]; then
  fail "NEXTAUTH_SECRET must be at least 32 characters."
fi

if ! printf '%s' "$SITE_DOMAIN" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$'; then
  fail "SITE_DOMAIN format looks invalid: '$SITE_DOMAIN'"
fi

# NEXTAUTH_URL host must match SITE_DOMAIN
nextauth_host=""
if command -v node >/dev/null 2>&1; then
  nextauth_host="$(node -e "try{const u=new URL(process.env.NEXTAUTH_URL);process.stdout.write(u.hostname||'')}catch(e){process.stdout.write('')}" 2>/dev/null || true)"
else
  # rough fallback
  nextauth_host="$(printf '%s' "$NEXTAUTH_URL" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##; s#:.*$##')"
fi
if [ -z "$nextauth_host" ] || [ "$nextauth_host" != "$SITE_DOMAIN" ]; then
  fail "NEXTAUTH_URL host ('$nextauth_host') must match SITE_DOMAIN ('$SITE_DOMAIN')."
fi

info "Validation passed. Starting stack..."
exec docker compose up -d --build
