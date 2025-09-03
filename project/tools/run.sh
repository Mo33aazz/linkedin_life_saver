#!/bin/bash
#
# This script serves as the main entry point for running the project.
# It first ensures all dependencies are installed by calling install.sh,
# then executes the primary run command for the project.

set -euo pipefail

# ---
# This function ensures the script is running from the project root.
# ---
setup_paths() {
    local SCRIPT_DIR
    SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
    PROJECT_ROOT="$SCRIPT_DIR/.."
    cd "$PROJECT_ROOT"
}

main() {
    setup_paths

    # Ensure the environment and dependencies are set up correctly before running.
    # All output from the install script is redirected to stderr to keep stdout
    # clean for the main application.
    echo "INFO: Checking dependencies before running..." >&2
    bash "tools/install.sh" >&2

    # Based on package.json, `npm run dev` is the command to start the
    # development server.
    echo "INFO: Starting the application..." >&2
    npm run dev
}

main