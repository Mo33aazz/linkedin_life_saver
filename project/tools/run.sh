#!/bin/bash
#
# Runs the main project application in development mode.
# It ensures all dependencies are installed before running.
#

set -euo pipefail

# --- Configuration ---
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
PROJECT_ROOT="$SCRIPT_DIR/.."
cd "$PROJECT_ROOT"

# --- Dependency Check ---
echo "--- Ensuring dependencies are installed ---" >&2
# Execute the installation script to ensure the environment is ready.
# All output from install.sh is redirected to stderr to keep stdout clean if needed.
bash "tools/install.sh" >&2

# --- Project Execution ---
echo "--- Running the project in development mode ---" >&2

# From package.json, the "dev" script ("vite") is the standard way to run this project.
# We use 'npm run dev' to execute it.
npm run dev