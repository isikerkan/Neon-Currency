#!/usr/bin/env bash
# Uploads a zip to the Chrome Web Store (API v2) and submits it for review.
# Usage: publish-cws.sh <extension.zip>
# Env: CWS_PUBLISHER_ID, CWS_EXTENSION_ID, CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN
set -euo pipefail

zip_file="${1:?usage: publish-cws.sh <extension.zip>}"
for var in CWS_PUBLISHER_ID CWS_EXTENSION_ID CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN; do
  if [ -z "${!var:-}" ]; then
    echo "Missing environment variable ${var}" >&2
    exit 1
  fi
done

api="https://chromewebstore.googleapis.com"
item="publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}"

# Prints the body, fails with the body on HTTP errors.
request() {
  local response status
  response=$(curl -sS -w $'\n%{http_code}' "$@")
  status="${response##*$'\n'}"
  response="${response%$'\n'*}"
  if [ "${status}" -lt 200 ] || [ "${status}" -ge 300 ]; then
    echo "HTTP ${status}: ${response}" >&2
    return 1
  fi
  printf '%s' "${response}"
}

echo "Requesting access token"
token=$(request https://oauth2.googleapis.com/token \
  --data-urlencode "client_id=${CWS_CLIENT_ID}" \
  --data-urlencode "client_secret=${CWS_CLIENT_SECRET}" \
  --data-urlencode "refresh_token=${CWS_REFRESH_TOKEN}" \
  --data-urlencode "grant_type=refresh_token" | jq -r .access_token)
[ -n "${GITHUB_ACTIONS:-}" ] && echo "::add-mask::${token}"
auth=(-H "Authorization: Bearer ${token}")

echo "Uploading ${zip_file}"
upload=$(request "${auth[@]}" -X POST -T "${zip_file}" "${api}/upload/v2/${item}:upload")
echo "${upload}"
state=$(jq -r '.uploadState // empty' <<<"${upload}")

for _ in $(seq 1 30); do
  [ "${state}" = "IN_PROGRESS" ] || break
  sleep 10
  status=$(request "${auth[@]}" "${api}/v2/${item}:fetchStatus")
  state=$(jq -r '.lastAsyncUploadState // .uploadState // empty' <<<"${status}")
  echo "Upload state: ${state}"
done

if [ "${state}" != "SUCCEEDED" ]; then
  echo "Upload did not succeed (state: ${state:-unknown})" >&2
  exit 1
fi

echo "Submitting for review"
request "${auth[@]}" -X POST -H "Content-Type: application/json" -d '{}' "${api}/v2/${item}:publish"
echo
echo "Submitted. Track the review in the Chrome Web Store Developer Dashboard."
