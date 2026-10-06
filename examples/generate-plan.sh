#!/usr/bin/env bash
#
# Generate a real terraform plan JSON for a scenario, fully offline (no cloud).
# Applies the baseline, then plans the change so the diff contains the interesting
# create/update/replace/delete mix.
#
#   ./examples/generate-plan.sh examples/high
#
set -euo pipefail

dir="${1:?usage: generate-plan.sh <scenario-dir>}"
cd "$dir"

# Clean any prior state and generated files so the run is reproducible.
rm -rf .terraform .terraform.lock.hcl terraform.tfstate terraform.tfstate.backup tfplan plan.json
rm -f ./*.txt ./fw_*.json 2>/dev/null || true

terraform init -input=false -no-color >/dev/null
terraform apply -auto-approve -input=false -no-color -var phase=base >/dev/null
terraform plan -input=false -no-color -out=tfplan -var phase=change >/dev/null
terraform show -json tfplan > plan.json

echo "wrote $(pwd)/plan.json"
echo "score it:  npm run score $(pwd)/plan.json"
