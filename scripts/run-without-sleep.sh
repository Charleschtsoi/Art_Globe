#!/usr/bin/env bash
# Run a command while preventing macOS system sleep (idle sleep / display sleep).
# Uses built-in `caffeinate -i`. On non-macOS, runs the command unchanged.
# Usage (from art-globe/): ./scripts/run-without-sleep.sh npm run kaggle2:enrich
set -e
if [[ "$(uname -s)" == "Darwin" ]] && command -v caffeinate >/dev/null 2>&1; then
  exec caffeinate -i -- "$@"
else
  exec "$@"
fi
