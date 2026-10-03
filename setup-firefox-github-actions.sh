#!/usr/bin/env bash

set -Eeuo pipefail

REPO="${GITHUB_REPOSITORY:-}"
STORAGE_STATE_PATH="${FACEBOOK_STORAGE_STATE_PATH:-facebook-storage-state.json}"
SKIP_GITHUB_SECRET=false
RUN_LOCAL_TEST=false

usage() {
  cat <<'EOF'
Usage:
  ./setup-firefox-github-actions.sh [options]

Options:
  --repo OWNER/REPO       GitHub repository to update
  --storage-state PATH    Path to the Playwright storage-state file
  --skip-github-secret    Do not upload the Facebook session to GitHub
  --run-test              Run the scraper locally after authentication
  -h, --help              Show this help message

Examples:
  ./setup-firefox-github-actions.sh
  ./setup-firefox-github-actions.sh --repo MubtasimSajid/facebook-event-scraper
  ./setup-firefox-github-actions.sh --run-test
EOF
}

log() {
  printf '\n\033[1;34m==> %s\033[0m\n' "$1"
}

fail() {
  printf '\n\033[1;31mError: %s\033[0m\n' "$1" >&2
  exit 1
}

cleanup() {
  unset FACEBOOK_STORAGE_STATE_B64
  unset SMTP_PASSWORD
}

trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      [[ $# -ge 2 ]] || fail "--repo requires OWNER/REPO"
      REPO="$2"
      shift 2
      ;;
    --storage-state)
      [[ $# -ge 2 ]] || fail "--storage-state requires a path"
      STORAGE_STATE_PATH="$2"
      shift 2
      ;;
    --skip-github-secret)
      SKIP_GITHUB_SECRET=true
      shift
      ;;
    --run-test)
      RUN_LOCAL_TEST=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

command -v node >/dev/null 2>&1 || fail "Node.js is not installed."
command -v npm >/dev/null 2>&1 || fail "npm is not installed."

NODE_MAJOR="$(node --version | sed 's/^v//' | cut -d. -f1)"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  fail "Node.js 20 or newer is required. Found: $(node --version)"
fi

log "Installing npm dependencies"

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

log "Installing Playwright Firefox"

npx playwright install firefox

if [[ ! -f .env && -f .env.example ]]; then
  log "Creating .env from .env.example"
  cp .env.example .env
  echo "Edit .env with your SMTP values before running the scraper."
fi

if [[ -f "$STORAGE_STATE_PATH" ]]; then
  printf '\nExisting Facebook session found at %s.\n' "$STORAGE_STATE_PATH"
  read -r -p "Create a fresh session instead? [y/N] " REFRESH_SESSION

  if [[ "$REFRESH_SESSION" =~ ^[Yy]$ ]]; then
    rm -f "$STORAGE_STATE_PATH"
  fi
fi

if [[ ! -f "$STORAGE_STATE_PATH" ]]; then
  log "Starting Firefox Facebook login"

  echo "A Playwright Firefox window will open."
  echo "Log in to Facebook manually, complete any verification, then return here."
  read -r -p "Press Enter to start authentication..."

  FACEBOOK_STORAGE_STATE_PATH="$STORAGE_STATE_PATH" npm run auth
fi

[[ -s "$STORAGE_STATE_PATH" ]] || fail \
  "Facebook session file was not created: $STORAGE_STATE_PATH"

log "Facebook session created successfully"

if [[ "$SKIP_GITHUB_SECRET" == true ]]; then
  echo "Skipping GitHub secret upload."
else
  command -v gh >/dev/null 2>&1 || fail \
    "GitHub CLI is required for secret upload. Install it or use --skip-github-secret."

  gh auth status >/dev/null 2>&1 || fail \
    "You are not authenticated with GitHub CLI. Run: gh auth login"

  if [[ -z "$REPO" ]]; then
    REPO="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
  fi

  [[ "$REPO" == */* ]] || fail "Repository must be in OWNER/REPO format."

  log "Uploading Facebook session to GitHub repository secret"

  if base64 --help 2>&1 | grep -q -- '--wrap'; then
    FACEBOOK_STORAGE_STATE_B64="$(
      base64 --wrap=0 "$STORAGE_STATE_PATH"
    )"
  else
    FACEBOOK_STORAGE_STATE_B64="$(
      base64 "$STORAGE_STATE_PATH" | tr -d '\r\n'
    )"
  fi

  printf '%s' "$FACEBOOK_STORAGE_STATE_B64" |
    gh secret set FACEBOOK_STORAGE_STATE_B64 --repo "$REPO"

  echo "Uploaded FACEBOOK_STORAGE_STATE_B64 to $REPO."
fi

if [[ "$RUN_LOCAL_TEST" == true ]]; then
  log "Running the scraper locally"

  [[ -f .env ]] || fail \
    ".env is missing. Create it from .env.example and fill in SMTP settings."

  FACEBOOK_STORAGE_STATE_PATH="$STORAGE_STATE_PATH" npm run scrape
else
  cat <<EOF

Setup complete.

Next steps:

1. Confirm your GitHub repository contains these secrets:
   - EMAIL_TO
   - SMTP_HOST
   - SMTP_PORT
   - SMTP_USER
   - SMTP_PASSWORD
   - FACEBOOK_STORAGE_STATE_B64

2. Start a manual GitHub Actions run.

3. Open:
   https://github.com/${REPO:-OWNER/REPO}/actions

To test locally after filling in .env:
  FACEBOOK_STORAGE_STATE_PATH="$STORAGE_STATE_PATH" npm run scrape

EOF
fi
