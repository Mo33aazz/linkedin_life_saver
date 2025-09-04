#!/bin/bash
#
# This script runs the project's automated tests.
# It first ensures all dependencies are installed, then checks for a 'test'
# script in package.json and executes it if found.

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

# ---
# This function checks for the presence of the 'jq' command-line tool,
# which is used to safely check for the existence of the test script.
# ---
check_dependencies() {
    if ! command -v jq &> /dev/null; then
        echo "WARNING: 'jq' is not installed. Cannot reliably check for 'test' script." >&2
        echo "INFO: Skipping tests." >&2
        exit 0
    fi
}

main() {
    setup_paths
    check_dependencies

    # Ensure dependencies are installed before running tests.
    echo "INFO: Checking dependencies before testing..." >&2
    bash "tools/install.sh" >&2

    # Safely check if a 'test' script is defined in package.json using jq.
    # The '-e' flag sets the exit code to 0 if the key is found, 1 otherwise.
    npm run build:test

    if jq -e '.scripts.test' package.json > /dev/null; then
        echo "INFO: 'test' script found. Running tests..." >&2
   
        npm test
        echo "SUCCESS: Tests passed." >&2
    else
        echo "INFO: No 'test' script found in package.json. Skipping tests." >&2
        # Exit with 0 because having no tests is not a failure.
        exit 0
    fi
}

# The script will exit with a non-zero code if `npm test` fails.
main