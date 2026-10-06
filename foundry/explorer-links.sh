#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="${1:-DemoArc.s.sol}"
FILE="broadcast/${SCRIPT_NAME}/5042/run-latest.json"
EXPLORER="https://explorer.arc.io"

if [[ ! -f "$FILE" ]]; then
  echo "No broadcast file at $FILE" >&2
  exit 1
fi

jq -r --arg e "$EXPLORER" '
  .transactions[]
  | "\(.function // ("deploy " + (.contractName // "contract")))\t\($e)/tx/\(.hash)"
' "$FILE"

jq -r --arg e "$EXPLORER" '
  .transactions[] | select(.transactionType == "CREATE")
  | "contract \(.contractName)\t\($e)/address/\(.contractAddress)"
' "$FILE"
