#!/usr/bin/env bash
#
# Apply the repository security settings that can't live in source:
# branch protection, required checks, and vulnerability features.
# Run once after creating the repo (requires the GitHub CLI, authenticated).
#
#   ./scripts/harden-repo.sh
#
set -euo pipefail

REPO="${REPO:-nandotorres/terraform-plan-verdict}"
BRANCH="${BRANCH:-main}"

echo "Hardening ${REPO} (${BRANCH})..."

# Require PRs, passing checks, code owner review, and a linear history on main.
gh api --method PUT "repos/${REPO}/branches/${BRANCH}/protection" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["build-test", "analyze"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": true,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON

# Enable Dependabot alerts and automated security fixes.
gh api --method PUT "repos/${REPO}/vulnerability-alerts"
gh api --method PUT "repos/${REPO}/automated-security-fixes"

# Enforce squash-only merges for a clean, linear history.
gh api --method PATCH "repos/${REPO}" \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F allow_squash_merge=true \
  -F delete_branch_on_merge=true >/dev/null

echo "Done. Enable Code scanning (CodeQL) in Settings -> Code security if not already on."
