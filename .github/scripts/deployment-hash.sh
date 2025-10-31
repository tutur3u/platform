#!/bin/bash

# Deployment Hash System
# Calculates and manages deployment hashes to determine if deployment is needed

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
APP=""
BRANCH=""
MODE="check"
STATUS=""
DEPLOYMENT_URL=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --app)
      APP="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    --status)
      STATUS="$2"
      shift 2
      ;;
    --url)
      DEPLOYMENT_URL="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$APP" ] || [ -z "$BRANCH" ]; then
  echo -e "${RED}Error: --app and --branch are required${NC}"
  exit 1
fi

# Sanitize branch name for filesystem (replace / with -)
BRANCH_SAFE=$(echo "$BRANCH" | tr '/' '-')

# Paths
HASH_DIR=".deployment-hashes/${BRANCH_SAFE}"
HASH_FILE="${HASH_DIR}/${APP}.json"

# Create hash directory if it doesn't exist
mkdir -p "$HASH_DIR"

# Function to calculate deployment hash
calculate_hash() {
  local app=$1

  echo -e "${BLUE}Calculating deployment hash for ${app}...${NC}" >&2

  # Collect all relevant files and compute their hashes
  local hash_input=""

  # 1. App source files and configuration
  if [ -d "apps/${app}" ]; then
    hash_input+=$(find "apps/${app}/src" -type f 2>/dev/null | sort | xargs sha256sum 2>/dev/null || echo "")
    hash_input+=$(find "apps/${app}" -maxdepth 1 -type f \( -name "*.js" -o -name "*.json" -o -name "*.ts" \) 2>/dev/null | sort | xargs sha256sum 2>/dev/null || echo "")
  fi

  # 2. Dependencies (bun.lock, bun.lockb, and package.json)
  if [ -f "bun.lockb" ]; then
    hash_input+=$(sha256sum "bun.lockb" 2>/dev/null || echo "")
  fi
  if [ -f "bun.lock" ]; then
    hash_input+=$(sha256sum "bun.lock" 2>/dev/null || echo "")
  fi
  if [ -f "package.json" ]; then
    hash_input+=$(sha256sum "package.json" 2>/dev/null || echo "")
  fi

  # 3. Shared workspace packages
  if [ -d "packages" ]; then
    hash_input+=$(find "packages" -type f -path "*/src/*" 2>/dev/null | sort | xargs sha256sum 2>/dev/null || echo "")
  fi

  # 4. Build tooling and CI config
  if [ -f "turbo.json" ]; then
    hash_input+=$(sha256sum "turbo.json" 2>/dev/null || echo "")
  fi
  if [ -d ".github/workflows" ]; then
    hash_input+=$(find ".github/workflows" -type f -name "*.yaml" -o -name "*.yml" 2>/dev/null | sort | xargs sha256sum 2>/dev/null || echo "")
  fi

  # Compute final hash
  if [ -z "$hash_input" ]; then
    echo -e "${RED}Warning: No files found for hashing${NC}" >&2
    echo "no-files-found"
    return 1
  fi

  local final_hash=$(echo "$hash_input" | sha256sum | awk '{print $1}')
  echo "$final_hash"
}

# Function to read stored hash
read_stored_hash() {
  if [ ! -f "$HASH_FILE" ]; then
    echo ""
    return 1
  fi

  jq -r '.hash' "$HASH_FILE" 2>/dev/null || echo ""
}

# Function to read deployment status
read_deployment_status() {
  if [ ! -f "$HASH_FILE" ]; then
    echo ""
    return 1
  fi

  jq -r '.deployment_status // "unknown"' "$HASH_FILE" 2>/dev/null || echo "unknown"
}

# Function to update hash file
update_hash_file() {
  local new_hash=$1
  local deploy_status=$2
  local deploy_url=$3

  cat > "$HASH_FILE" <<EOF
{
  "hash": "${new_hash}",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "commit": "${GITHUB_SHA:-unknown}",
  "deployment_status": "${deploy_status}",
  "deployment_url": "${deploy_url}"
}
EOF

  echo -e "${GREEN}Updated hash file: ${HASH_FILE}${NC}" >&2
}

# MODE: check
if [ "$MODE" = "check" ]; then
  echo -e "${BLUE}=== Deployment Hash Check ===${NC}" >&2
  echo -e "${BLUE}App: ${APP}${NC}" >&2
  echo -e "${BLUE}Branch: ${BRANCH}${NC}" >&2

  # Calculate current hash
  CURRENT_HASH=$(calculate_hash "$APP") || {
    echo -e "${YELLOW}::warning::Hash calculation failed. Deploying for safety.${NC}" >&2
    echo "needs_deployment=true" >> $GITHUB_OUTPUT
    echo "hash_changed=unknown" >> $GITHUB_OUTPUT
    echo "last_failed=false" >> $GITHUB_OUTPUT
    exit 0
  }

  echo -e "${BLUE}Current hash: ${CURRENT_HASH}${NC}" >&2

  # Read stored hash
  STORED_HASH=$(read_stored_hash) || STORED_HASH=""
  LAST_STATUS=$(read_deployment_status) || LAST_STATUS="unknown"

  if [ -z "$STORED_HASH" ]; then
    echo -e "${YELLOW}No previous deployment found. First deployment needed.${NC}" >&2
    echo "needs_deployment=true" >> $GITHUB_OUTPUT
    echo "hash_changed=true" >> $GITHUB_OUTPUT
    echo "last_failed=false" >> $GITHUB_OUTPUT
    exit 0
  fi

  echo -e "${BLUE}Stored hash: ${STORED_HASH}${NC}" >&2
  echo -e "${BLUE}Last deployment status: ${LAST_STATUS}${NC}" >&2

  # Compare hashes
  HASH_CHANGED="false"
  if [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
    HASH_CHANGED="true"
  fi

  # Special logic for staging branch
  if [ "$BRANCH" = "staging" ]; then
    echo -e "${YELLOW}Staging branch detected${NC}" >&2

    if [ "$LAST_STATUS" = "failure" ]; then
      echo -e "${YELLOW}Last staging deployment failed. Forcing redeploy.${NC}" >&2
      echo "needs_deployment=true" >> $GITHUB_OUTPUT
      echo "hash_changed=${HASH_CHANGED}" >> $GITHUB_OUTPUT
      echo "last_failed=true" >> $GITHUB_OUTPUT
    elif [ "$HASH_CHANGED" = "true" ]; then
      echo -e "${GREEN}Hash changed. Deploying staging.${NC}" >&2
      echo "needs_deployment=true" >> $GITHUB_OUTPUT
      echo "hash_changed=true" >> $GITHUB_OUTPUT
      echo "last_failed=false" >> $GITHUB_OUTPUT
    else
      echo -e "${GREEN}Staging: No changes and last deploy succeeded. Skipping.${NC}" >&2
      echo "needs_deployment=false" >> $GITHUB_OUTPUT
      echo "hash_changed=false" >> $GITHUB_OUTPUT
      echo "last_failed=false" >> $GITHUB_OUTPUT
    fi
  else
    # Feature branch logic
    if [ "$HASH_CHANGED" = "true" ]; then
      echo -e "${GREEN}Hash changed. Deployment needed.${NC}" >&2
      echo "needs_deployment=true" >> $GITHUB_OUTPUT
      echo "hash_changed=true" >> $GITHUB_OUTPUT
      echo "last_failed=false" >> $GITHUB_OUTPUT
    else
      echo -e "${GREEN}Hash unchanged. Skipping deployment.${NC}" >&2
      echo "needs_deployment=false" >> $GITHUB_OUTPUT
      echo "hash_changed=false" >> $GITHUB_OUTPUT
      echo "last_failed=false" >> $GITHUB_OUTPUT
    fi
  fi

# MODE: update
elif [ "$MODE" = "update" ]; then
  echo -e "${BLUE}=== Updating Deployment Hash ===${NC}" >&2

  if [ -z "$STATUS" ]; then
    echo -e "${RED}Error: --status is required for update mode${NC}" >&2
    exit 1
  fi

  # Calculate current hash
  CURRENT_HASH=$(calculate_hash "$APP") || {
    echo -e "${YELLOW}::warning::Hash calculation failed during update. Skipping hash update.${NC}" >&2
    exit 0
  }

  # Update hash file
  update_hash_file "$CURRENT_HASH" "$STATUS" "$DEPLOYMENT_URL"

  echo -e "${GREEN}Deployment hash updated successfully${NC}" >&2
  echo -e "${GREEN}Status: ${STATUS}${NC}" >&2

else
  echo -e "${RED}Error: Invalid mode '${MODE}'. Use 'check' or 'update'${NC}" >&2
  exit 1
fi
