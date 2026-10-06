#!/usr/bin/env bash
#
# Score a plan JSON locally with the built action (no GitHub needed).
#
#   npm run build            # once, or after changing src/
#   ./scripts/score.sh examples/high/plan.json [provider]
#
# Optional env for AI providers:
#   MODEL=...  BASE_URL=...  API_KEY=...
# e.g. local Ollama (no token):
#   MODEL=llama3.2:1b BASE_URL=http://localhost:11434/v1 \
#     ./scripts/score.sh examples/high/plan.json openai
#
set -euo pipefail

plan="${1:?usage: score.sh <plan.json> [provider]}"
provider="${2:-rules}"
here="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$plan" ]; then
  echo "error: plan file not found: '$plan' (cwd: $PWD)" >&2
  exit 1
fi
# Absolutize so the action's working directory doesn't matter.
plan="$(cd "$(dirname "$plan")" && pwd)/$(basename "$plan")"

out="$(mktemp)"
env "INPUT_PLAN-JSON=$plan" \
    "INPUT_PROVIDER=$provider" \
    ${MODEL:+"INPUT_MODEL=$MODEL"} \
    ${BASE_URL:+"INPUT_BASE-URL=$BASE_URL"} \
    ${API_KEY:+"INPUT_API-KEY=$API_KEY"} \
    INPUT_COMMENT=false INPUT_LABELS=false INPUT_SUMMARY=false "INPUT_FAIL-ON=none" \
    GITHUB_OUTPUT="$out" \
    node "$here/dist/index.js"

echo "----- verdict -----"
grep -A1 '^verdict<<' "$out" | sed -n '2p' | sed 's/^/verdict: /'
grep -A1 '^overall-score<<' "$out" | sed -n '2p' | sed 's/^/score:   /'
grep -A1 '^scores-json<<' "$out" | sed -n '2p'
rm -f "$out"
