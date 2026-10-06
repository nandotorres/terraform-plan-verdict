# Security

## Reporting a vulnerability

Please report security issues privately via GitHub's **Report a vulnerability** button
(Security → Advisories) rather than opening a public issue. We aim to acknowledge reports
within 3 business days.

## Supply-chain posture

This action treats supply-chain security as a first-class concern.

**Least privilege**
- Every workflow sets `permissions: {}` at the top level and grants the minimum scopes per job.
- Comments and labels require `pull-requests: write`; everything else runs read-only.

**Pinned dependencies**
- All third-party actions are pinned to a full commit SHA with the version in a comment.
- Node dependencies are installed with `npm ci` from a committed `package-lock.json`.
- Installs run with `--ignore-scripts` to block dependency lifecycle scripts.

**Runtime hardening**
- Every job runs `step-security/harden-runner` with `disable-sudo`. CI uses egress `audit`; the release job uses egress `block` with an allowlist limited to GitHub, npm, and Sigstore.
- Jobs set `timeout-minutes` and workflows use `concurrency` to cancel superseded runs.
- `actions/checkout` runs with `persist-credentials: false`.

**Repository governance**
- `CODEOWNERS` requires owner review, enforced by branch protection.
- `main` requires PRs, passing `build-test` and `analyze` checks, code-owner approval, linear history, and conversation resolution.
- Apply these settings with [`scripts/harden-repo.sh`](scripts/harden-repo.sh) (uses the GitHub CLI).

**Continuous assurance**
- `npm audit` (high severity) on every CI and release run.
- CodeQL (`security-extended`) on pushes, PRs, and a weekly schedule.
- OpenSSF Scorecard published weekly.
- Dependency Review blocks PRs that introduce high-severity advisories.
- Dependabot keeps npm packages and pinned action SHAs patched.

**Release integrity**
- Releases are cut only from `vX.Y.Z` tags via the release workflow.
- The workflow fails if the committed `dist/` bundle does not match a fresh build.
- Build provenance is attested with `actions/attest-build-provenance` (verifiable with `gh attestation verify`).

## Data handling

Only a redacted plan summary is sent to jev for scoring: change actions, resource types, and a small
set of security flags. Resource attribute **values are never transmitted**.

## Verifying a release

```sh
gh attestation verify dist/index.js --repo nandotorres/terraform-plan-verdict
```
