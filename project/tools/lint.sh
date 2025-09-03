#!/bin/bash
#
# Lints the project's source code using ESLint.
# The output is formatted as a single JSON array to stdout.
# All other informational output is sent to stderr.
#
# Exits with 0 if linting passes.
# Exits with a non-zero code if linting fails or an error occurs.
#

set -euo pipefail

# --- Configuration ---
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
PROJECT_ROOT="$SCRIPT_DIR/.."
cd "$PROJECT_ROOT"

# --- Dependency Check ---
# Ensure dependencies, including eslint, are installed silently.
# All output is redirected to /dev/null to meet the JSON-only stdout requirement.
bash "tools/install.sh" > /dev/null 2>&1

# --- Prerequisite Check ---
# This script uses 'jq' to transform ESLint's JSON output.
if ! command -v jq &> /dev/null; then
    echo '{"error": "jq is not installed. Please install jq to format the linting output."}' >&2
    exit 1
fi

# --- Linting Execution ---
# Run eslint with the JSON formatter. We must capture the output and exit code separately
# to process the JSON while preserving the success/failure status.
# A temporary file is the most reliable way to do this.
LINT_OUTPUT_FILE=$(mktemp)
# Ensure the temporary file is removed on script exit.
trap 'rm -f "$LINT_OUTPUT_FILE"' EXIT

# The lint command is derived from package.json: "eslint . --ext .ts,.tsx --report-unused-disable-directives --max-warnings 0"
# We add the --format json flag to get structured output.
# The exit code is captured for later use.
npx eslint . --ext .ts,.tsx --report-unused-disable-directives --max-warnings 0 --format json > "$LINT_OUTPUT_FILE"
LINT_EXIT_CODE=$?

# --- Output Formatting ---
# Process the ESLint JSON output to the required format using jq.
# ESLint's output is an array of file objects, each with a `messages` array.
# We transform this into a single flat array of issue objects.
# The 'obj' field is mapped from 'nodeType', defaulting to an empty string if null.
jq '[.[] | .filePath as $path | .messages[] | {type: .ruleId, path: $path, obj: (.nodeType // ""), message: .message, line: .line, column: .column}]' "$LINT_OUTPUT_FILE"

# Exit with the original exit code from eslint.
# This ensures that the script correctly reports success (0) or failure (non-zero).
exit $LINT_EXIT_CODE