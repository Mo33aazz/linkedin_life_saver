#!/bin/bash
#
# This script lints the project's source code.
# It ensures all dependencies are installed, then runs the linter.
# The output is strictly formatted as a single JSON array to stdout.
# All informational messages are sent to stderr.

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
# which is required for formatting the linter's output.
# ---
check_dependencies() {
    if ! command -v jq &> /dev/null; then
        echo "ERROR: 'jq' is not installed. Please install it to use the lint script." >&2
        # Output a valid but empty JSON to stdout to satisfy the output contract.
        echo "[]"
        exit 1
    fi
}

main() {
    setup_paths
    check_dependencies

    # Ensure dependencies are installed silently to not pollute stdout/stderr.
    bash "tools/install.sh" &> /dev/null

    echo "INFO: Running linter..." >&2

    # Use `set -o pipefail` to ensure that if `eslint` fails, the entire
    # pipeline fails, propagating the correct exit code.
    set -o pipefail

    local lint_output
    local exit_code=0

    # Temporarily disable `set -e` to allow us to capture the exit code
    # without the script immediately terminating.
    set +e
    lint_output=$(npx eslint . --ext .ts,.tsx --format json | \
        jq '[.[] | .filePath as $path | .messages[] | {type: .ruleId, path: $path, obj: (.nodeType // "N/A"), message: .message, line: .line, column: .column}]')
    exit_code=$?
    set -e

    # Always print the captured JSON output to stdout.
    echo "$lint_output"

    # ESLint exit codes:
    # 0: No errors found.
    # 1: Linting errors were found.
    # 2: Script-level failure (e.g., configuration problem).
    #
    # We treat both 0 and 1 as a "successful" run of this script.
    if [ "$exit_code" -eq 0 ] || [ "$exit_code" -eq 1 ]; then
        exit 0
    else
        # For any other error (>=2), propagate that error code.
        exit "$exit_code"
    fi
}

main