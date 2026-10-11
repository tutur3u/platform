#!/bin/bash
set -e
node "$(dirname "$0")/package-update.js" "$@"
