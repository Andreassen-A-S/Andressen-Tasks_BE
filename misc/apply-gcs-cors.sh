#!/bin/bash
# Usage: FRONTEND_URL="https://app.example.com" GCS_BUCKET="your-bucket" ./misc/apply-gcs-cors.sh
set -e

if [ -z "$FRONTEND_URL" ]; then
  echo "Error: FRONTEND_URL is not set" >&2
  exit 1
fi

if [ -z "$GCS_BUCKET" ]; then
  echo "Error: GCS_BUCKET is not set" >&2
  exit 1
fi

# Build origin array from comma-separated FRONTEND_URL
ORIGINS=$(echo "$FRONTEND_URL" | tr ',' '\n' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//' | jq -R . | jq -s .)

CORS_JSON=$(jq -n --argjson origins "$ORIGINS" '[{
  "origin": $origins,
  "method": ["PUT", "OPTIONS"],
  "responseHeader": ["Content-Type"],
  "maxAgeSeconds": 3600
}]')

TMPFILE=$(mktemp /tmp/gcs-cors-XXXXXX.json)
echo "$CORS_JSON" > "$TMPFILE"

echo "Applying CORS config to gs://$GCS_BUCKET:"
echo "$CORS_JSON"

gsutil cors set "$TMPFILE" "gs://$GCS_BUCKET"
rm "$TMPFILE"

echo "Done."
