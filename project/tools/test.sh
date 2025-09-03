#!/bin/bash
#
# Runs the project's test suite.
# Since no explicit test command is defined, this script runs the linter as a static test.
#

set -euo pipefail

# --- Configuration ---
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
PROJECT_ROOT="$SCRIPT_DIR/.."
cd "$PROJECT_ROOT"

# --- Dependency Check ---
echo "--- Ensuring dependencies are installed ---" >&2
# Execute the installation script to ensure the environment is ready.
bash "tools/install.sh" >&2

# --- Test Execution ---
echo "--- Running tests ---" >&2

# The package.json file does not define a "test" script.
# As a best practice for ensuring code quality, we will execute the "lint" script
# as a form of static analysis testing.
echo "No 'test' script found in package.json. Running 'lint' script as a static test." >&2

if npm run lint; then
    echo "Tests (linting) passed successfully." >&2
else
    echo "Tests (linting) failed. Please check the output above for details." >&2
    # Exit with a failure code to signal that the test step failed.
    exit 1
fi

exit 0