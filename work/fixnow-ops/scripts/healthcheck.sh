#!/usr/bin/env bash
set -euo pipefail

URL="${URL:-https://api.fixnowghana.org/api/health}"

BODY="$(curl -fsS --max-time 10 "$URL")"
echo "$BODY"

case "$BODY" in
  *'"ok":true'*)
    exit 0
    ;;
  *)
    echo "Healthcheck failed: ok=true not found"
    exit 2
    ;;
esac
