#!/bin/bash

# Unix shell script for running the sort-types.js script
# This is an alternative to the Node.js script for Unix users

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_SCRIPT="$SCRIPT_DIR/sort-types.js"

if [ ! -f "$NODE_SCRIPT" ]; then
    echo "❌ Error: sort-types.js not found at $NODE_SCRIPT"
    exit 1
fi

node "$NODE_SCRIPT"

if [ $? -ne 0 ]; then
    echo "❌ Error running sort-types script"
    exit 1
fi

echo "✅ Successfully sorted object keys in types file" 