#!/usr/bin/env bash
# End-to-end check of the running Docker stack, used by the "Docker" job in .github/workflows/ci.yml and
# runnable by hand after "docker compose up":   bash scripts/docker-smoke-test.sh
# It talks to the stack only through the web container (the same way a browser does), so a pass means the
# web server, the API and the database are all up and wired together.
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
LOGS="${LOG_CMD:-docker compose logs backend}"
CURL=(curl -sS --fail-with-body ${CURL_OPTS:-})
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; exit 1; }

# 1. The web container serves the React app.
curl -sS ${CURL_OPTS:-} "$BASE/" | grep -q '<div id="root">' && pass "web container serves the React app" || fail "React app not served"

# 2. Security headers are sent with the app.
headers=$(curl -sS ${CURL_OPTS:-} -D - -o /dev/null "$BASE/")
echo "$headers" | grep -qi '^content-security-policy:' && pass "Content-Security-Policy header present" || fail "CSP header missing"
echo "$headers" | grep -qi '^x-frame-options: DENY' && pass "X-Frame-Options: DENY present" || fail "X-Frame-Options missing"

# 3. The API answers through the web container's proxy, and so is connected to its own container.
"${CURL[@]}" "$BASE/api/health" | grep -q '"success":true' && pass "API health check through the web proxy" || fail "API health check"

# 4. The database works: register, read the code the API logged, verify, and log in.
run=$(date +%s)
email="docker.smoke.${run}@gmail.com"
password='Blue-River-Mango-4821!'
body=$(printf '{"name":"Docker Smoke","email":"%s","password":"%s","role":"freelancer"}' "$email" "$password")
reg=$("${CURL[@]}" -X POST -H 'Content-Type: application/json' -d "$body" "$BASE/api/auth/register")
token=$(echo "$reg" | jq -r '.data.verifyToken')
[ -n "$token" ] && [ "$token" != "null" ] && pass "registration accepted and stored in MongoDB" || fail "registration"
sleep 1
code=$($LOGS 2>&1 | grep -o 'verification code is [0-9]\{6\}' | tail -1 | grep -o '[0-9]\{6\}')
[ -n "$code" ] || fail "verification code not found in the API log"
ver=$("${CURL[@]}" -X POST -H 'Content-Type: application/json' -d "$(printf '{"verifyToken":"%s","code":"%s"}' "$token" "$code")" "$BASE/api/auth/verify-email")
jwt=$(echo "$ver" | jq -r '.data.token')
[ -n "$jwt" ] && [ "$jwt" != "null" ] && pass "email verified, login token issued" || fail "email verification"

# 5. A protected endpoint accepts the token and the tax feature answers from the container.
inc=$("${CURL[@]}" -H "Authorization: Bearer $jwt" "$BASE/api/transactions/income")
echo "$inc" | jq -e '.data.tax.taxYearLabel' >/dev/null && pass "protected income and tax endpoint answers with a valid token" || fail "income endpoint"

# 6. And rejects a request without one.
status=$(curl -sS ${CURL_OPTS:-} -o /dev/null -w '%{http_code}' "$BASE/api/transactions/income")
[ "$status" = "401" ] && pass "request without a token is rejected (401)" || fail "expected 401, got $status"

echo "All Docker smoke checks passed."
