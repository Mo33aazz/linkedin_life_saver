#!/bin/bash
#
# Installs project dependencies using npm.
# This script is idempotent and can be run multiple times safely.
#

# Exit immediately if a command exits with a non-zero status.
# Treat unset variables as an error.
# The return value of a pipeline is the status of the last command to exit with a non-zero status.
set -euo pipefail

# --- Configuration ---
# Get the directory of the currently executing script
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
# Navigate to the project root directory (one level up from 'tools')
PROJECT_ROOT="$SCRIPT_DIR/.."
cd "$PROJECT_ROOT"

# --- Main Logic ---
echo "--- Setting up Node.js environment ---" >&2

# Check for npm, the Node.js package manager
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed. Please install Node.js and npm to continue." >&2
    exit 1
fi

echo "Installing/updating dependencies from package.json..." >&2
# npm install is idempotent. It installs dependencies listed in package.json
# and ensures the node_modules directory is in the correct state.
npm install

echo "Dependencies are up to date." >&2
echo "Environment setup complete. Use 'npm run <script_name>' or 'npx <command>' to run project tools." >&2

exit 0