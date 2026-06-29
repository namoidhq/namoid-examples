#!/usr/bin/env bash
#
# ============================================================================
#  NamoID — OAuth 2.1 Authorization Code + PKCE flow, by hand, with curl
# ============================================================================
#
#  This script runs the ENTIRE login flow against a NamoID OIDC provider using
#  nothing but curl, openssl, and jq. There is no framework and no OAuth
#  library hiding the details — every HTTP request is visible. Read it
#  top-to-bottom to understand exactly what the other examples in this repo
#  (Next.js, Spring, FastAPI, ...) automate for you.
#
#  Required tools:
#    - bash    (>= 4 recommended; uses `set -o pipefail`)
#    - curl    (HTTP requests)
#    - openssl (PKCE hashing + base64url + random bytes)
#    - jq      (parse JSON responses)
#
#  Run:
#    cp .env.example .env   # then fill in the 4 NAMOID_ vars
#    chmod +x login.sh
#    ./login.sh
#
# ============================================================================

set -euo pipefail

# ----------------------------------------------------------------------------
#  Small helpers for readable, sectioned output.
# ----------------------------------------------------------------------------
banner() {
  printf '\n============================================================\n'
  printf '  %s\n' "$1"
  printf '============================================================\n'
}

die() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not installed."
}

# ----------------------------------------------------------------------------
#  STEP 0 — Preflight: required tools.
# ----------------------------------------------------------------------------
need curl
need openssl
need jq

# ----------------------------------------------------------------------------
#  STEP 1 — Load configuration.
#
#  We read the four NAMOID_ settings from the environment. If a local `.env`
#  file exists next to this script, we source it first as a convenience.
#  (Real credentials live in `.env`, which is gitignored.)
# ----------------------------------------------------------------------------
banner "STEP 1 — Load config (.env if present)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  echo "Sourcing ${SCRIPT_DIR}/.env"
  # shellcheck disable=SC1091
  set -a
  . "${SCRIPT_DIR}/.env"
  set +a
else
  echo "No .env found — relying on the current environment."
fi

: "${NAMOID_ISSUER:?Set NAMOID_ISSUER (e.g. https://<slug>.id.namoid.in)}"
: "${NAMOID_CLIENT_ID:?Set NAMOID_CLIENT_ID}"
: "${NAMOID_CLIENT_SECRET:?Set NAMOID_CLIENT_SECRET}"
: "${NAMOID_REDIRECT_URI:=http://localhost:3011/callback}"

# Normalize: strip any trailing slash from the issuer so we don't end up with
# a `//.well-known` double-slash. A mismatched `iss` is a classic footgun.
NAMOID_ISSUER="${NAMOID_ISSUER%/}"

echo "issuer:       ${NAMOID_ISSUER}"
echo "client_id:    ${NAMOID_CLIENT_ID}"
echo "redirect_uri: ${NAMOID_REDIRECT_URI}"

# ----------------------------------------------------------------------------
#  STEP 2 — DISCOVERY (OIDC Discovery 1.0).
#
#  Every OIDC provider publishes its endpoints at a well-known URL. We fetch
#  it once and pull out the four endpoints we need. Nothing is hardcoded.
# ----------------------------------------------------------------------------
banner "STEP 2 — Discovery"

DISCOVERY_URL="${NAMOID_ISSUER}/.well-known/openid-configuration"
echo "GET ${DISCOVERY_URL}"

discovery_json="$(curl -fsS "${DISCOVERY_URL}")" \
  || die "Discovery request failed. Is NAMOID_ISSUER correct?"

authorization_endpoint="$(echo "${discovery_json}" | jq -r '.authorization_endpoint')"
token_endpoint="$(echo "${discovery_json}" | jq -r '.token_endpoint')"
userinfo_endpoint="$(echo "${discovery_json}" | jq -r '.userinfo_endpoint')"
jwks_uri="$(echo "${discovery_json}" | jq -r '.jwks_uri')"

[[ "${authorization_endpoint}" != "null" ]] || die "No authorization_endpoint in discovery doc."
[[ "${token_endpoint}"        != "null" ]] || die "No token_endpoint in discovery doc."

echo "authorization_endpoint: ${authorization_endpoint}"
echo "token_endpoint:         ${token_endpoint}"
echo "userinfo_endpoint:      ${userinfo_endpoint}"
echo "jwks_uri:               ${jwks_uri}"

# ----------------------------------------------------------------------------
#  STEP 3 — PKCE (RFC 7636) + state + nonce.
#
#  PKCE protects the authorization code in transit. We invent a random
#  `code_verifier`, send only its SHA-256 hash (`code_challenge`) to the
#  authorize endpoint, and reveal the verifier itself only at the token
#  endpoint. The server checks they match — so a stolen code is useless
#  without the verifier.
#
#  `state` defends against CSRF; `nonce` binds the resulting id_token to this
#  exact request (we'll see it echoed back inside the token).
# ----------------------------------------------------------------------------
banner "STEP 3 — PKCE, state, nonce"

# code_verifier: 43-128 chars from the unreserved set [A-Za-z0-9-._~].
# We take random bytes, base64-encode them, drop non-urlsafe chars, trim to 64.
code_verifier="$(openssl rand -base64 60 | tr -d '\n=+/' | cut -c1-64)"

# code_challenge = BASE64URL( SHA256( code_verifier ) ), method S256.
code_challenge="$(
  printf '%s' "${code_verifier}" \
    | openssl dgst -binary -sha256 \
    | openssl base64 \
    | tr '+/' '-_' \
    | tr -d '='
)"

state="$(openssl rand -hex 16)"
nonce="$(openssl rand -hex 16)"

echo "code_verifier:  ${code_verifier}"
echo "code_challenge: ${code_challenge}  (method=S256)"
echo "state:          ${state}"
echo "nonce:          ${nonce}"

# ----------------------------------------------------------------------------
#  STEP 4 — AUTHORIZE: build the URL the user opens in a browser.
#
#  There is no web server listening on the redirect URI in this example, so
#  after you sign in, the browser will try to load
#  http://localhost:3011/callback?code=...&state=... and "fail to connect".
#  That's fine — copy the `code` query-param straight out of the address bar.
# ----------------------------------------------------------------------------
banner "STEP 4 — Authorize (open this in your browser)"

# Minimal URL-encoder for the redirect_uri and scope (which contain special
# chars). Everything else here is already URL-safe.
urlencode() {
  local s="$1" out='' c
  for (( i = 0; i < ${#s}; i++ )); do
    c="${s:i:1}"
    case "${c}" in
      [a-zA-Z0-9.~_-]) out+="${c}" ;;
      *) out+="$(printf '%%%02X' "'${c}")" ;;
    esac
  done
  printf '%s' "${out}"
}

scope="openid profile email"

authorize_url="${authorization_endpoint}"
authorize_url+="?response_type=code"
authorize_url+="&client_id=$(urlencode "${NAMOID_CLIENT_ID}")"
authorize_url+="&redirect_uri=$(urlencode "${NAMOID_REDIRECT_URI}")"
authorize_url+="&scope=$(urlencode "${scope}")"
authorize_url+="&state=${state}"
authorize_url+="&nonce=${nonce}"
authorize_url+="&code_challenge=${code_challenge}"
authorize_url+="&code_challenge_method=S256"

cat <<EOF

Open this URL in a browser, sign in, and approve:

${authorize_url}

After sign-in the browser redirects to:
  ${NAMOID_REDIRECT_URI}?code=<CODE>&state=<STATE>

Nothing is listening there, so the page won't load — that's expected.
Copy the value of the 'code' parameter from the address bar and paste it below.

EOF

printf 'Paste the authorization code: '
read -r code
[[ -n "${code}" ]] || die "No code entered."

# Optional: verify the returned state matches what we sent (CSRF defense).
printf 'Paste the returned state (optional, Enter to skip): '
read -r returned_state || true
if [[ -n "${returned_state}" && "${returned_state}" != "${state}" ]]; then
  die "state mismatch — possible CSRF. expected '${state}', got '${returned_state}'."
fi

# ----------------------------------------------------------------------------
#  STEP 5 — TOKEN: exchange the code for tokens.
#
#  We authenticate the client with HTTP Basic (`client_secret_basic`) via
#  curl's -u, and prove possession of the PKCE verifier with `code_verifier`.
# ----------------------------------------------------------------------------
banner "STEP 5 — Token exchange"

echo "POST ${token_endpoint}"

token_json="$(
  curl -fsS -u "${NAMOID_CLIENT_ID}:${NAMOID_CLIENT_SECRET}" \
    "${token_endpoint}" \
    -d grant_type=authorization_code \
    -d code="${code}" \
    -d redirect_uri="${NAMOID_REDIRECT_URI}" \
    -d code_verifier="${code_verifier}"
)" || die "Token request failed (invalid_grant? invalid_client? redirect_uri mismatch?)."

echo "${token_json}" | jq '{access_token, id_token, refresh_token, token_type, expires_in, scope}'

access_token="$(echo "${token_json}" | jq -r '.access_token')"
id_token="$(echo "${token_json}" | jq -r '.id_token')"

[[ "${access_token}" != "null" && -n "${access_token}" ]] || die "No access_token in token response."

# ----------------------------------------------------------------------------
#  STEP 6 — DECODE the id_token (for display only).
#
#  A JWT is three base64url segments: header.payload.signature. We decode the
#  middle segment to read the claims.
#
#  *** IMPORTANT ***  This only DECODES the token. A real client MUST VERIFY
#  the RS256 signature against the provider's public keys at `jwks_uri`
#  (${jwks_uri}) and check iss / aud / exp / nonce before trusting any claim.
#  The library-based examples in this repo (e.g. nextjs-quickstart,
#  python-fastapi, go-oidc) do that verification for you.
# ----------------------------------------------------------------------------
banner "STEP 6 — Decode id_token (DISPLAY ONLY — not verified)"

if [[ "${id_token}" != "null" && -n "${id_token}" ]]; then
  # base64url-decode the payload (2nd segment). Convert urlsafe alphabet back
  # to standard, then pad the length to a multiple of 4 so openssl is happy.
  b64url_decode() {
    local data="${1//-/+}"
    data="${data//_//}"
    local pad=$(( ${#data} % 4 ))
    if (( pad == 2 )); then data+='=='; elif (( pad == 3 )); then data+='='; fi
    printf '%s' "${data}" | openssl base64 -d -A
  }

  payload_b64="$(printf '%s' "${id_token}" | cut -d. -f2)"
  b64url_decode "${payload_b64}" \
    | jq '{sub, email, iss, aud, exp, iat, nonce}'

  # Sanity-check that the nonce came back unchanged (replay/mix-up defense).
  token_nonce="$(b64url_decode "${payload_b64}" | jq -r '.nonce // empty')"
  if [[ -n "${token_nonce}" && "${token_nonce}" != "${nonce}" ]]; then
    echo "WARNING: id_token nonce does not match the one we sent."
  fi
else
  echo "No id_token returned (did you request the 'openid' scope?)."
fi

# ----------------------------------------------------------------------------
#  STEP 7 — USERINFO: call the protected endpoint with the access token.
# ----------------------------------------------------------------------------
banner "STEP 7 — UserInfo"

if [[ "${userinfo_endpoint}" != "null" && -n "${userinfo_endpoint}" ]]; then
  echo "GET ${userinfo_endpoint}"
  curl -fsS "${userinfo_endpoint}" \
    -H "Authorization: Bearer ${access_token}" \
    | jq '.'
else
  echo "Provider did not advertise a userinfo_endpoint; skipping."
fi

# ----------------------------------------------------------------------------
#  Done.
# ----------------------------------------------------------------------------
banner "SUCCESS — completed the Authorization Code + PKCE flow against NamoID"
