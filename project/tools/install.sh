#!/bin/bash
#
# This script handles the installation and updating of all project dependencies.
# It detects the project type (Node.js) and uses npm to manage dependencies,
# ensuring the environment is correctly set up for other scripts.
# The script is idempotent and can be safely re-run.

# ---
# Best Practices:
#   -e: exit immediately if a command exits with a non-zero status.
#   -u: treat unset variables as an error when substituting.
#   -o pipefail: the return value of a pipeline is the status of the last
#                command to exit with a non-zero status, or zero if no
#                command exited with a non-zero status.
# ---
set -euo pipefail

# ---
# This function ensures the script is running from the project root.
# It finds the script's own directory, then navigates up to the parent,
# which is assumed to be the project root.
# ---
setup_paths() {
    # Get the directory of this script to ensure we can find the project root
    # and other scripts reliably.
    local SCRIPT_DIR
    SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
    PROJECT_ROOT="$SCRIPT_DIR/.."
    cd "$PROJECT_ROOT"
}

main() {
    setup_paths

    echo "INFO: Ensuring project dependencies are installed with npm..." >&2
    # npm install is idempotent. It will only install or update packages if
    # package.json or package-lock.json have changed, or if node_modules
    # is missing.
    npm install
    echo "SUCCESS: Dependencies are up to date." >&2
}

# Execute the main function
main