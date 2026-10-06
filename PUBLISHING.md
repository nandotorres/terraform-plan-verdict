# Publishing to the GitHub Marketplace

## Release a version

The release workflow runs on every `vX.Y.Z` tag: it builds, tests, verifies the committed `dist/`,
creates a GitHub Release, and moves the floating major tag (`v1`) so consumers can pin `@v1`.

```sh
# make sure the bundle is fresh and committed
npm ci
npm run build
git add dist
git commit -m "build: dist for v1.0.0"

# tag and push
git tag v1.0.0
git push origin main --tags
```

After the tag is pushed, the workflow publishes the release and updates the `v1` tag automatically.

## List on the Marketplace

1. Open the published release on GitHub.
2. Check **Publish this Action to the GitHub Marketplace** and accept the agreement.
3. Confirm the metadata pulled from `action.yml`:
   - **Name:** Terraform Plan Verdict
   - **Icon / color:** `shield` / `purple` (set in `action.yml`)
4. Pick categories: **Code quality** and **Security**.
5. Publish.

Requirements GitHub enforces: the repo must be public, `action.yml` must be at the repo root, the name
must be unique across the Marketplace, and the release must point at a real tag.

## Listing copy

**Short description**

> Score a Terraform plan with jev (TypeSafe AI) and surface the risk verdict in the job summary, as a PR
> comment, and as labels.

**Keywords**

```
terraform, terraform-plan, jev, typesafe, typesafe-ai, system-one, systemone,
infrastructure-as-code, iac, risk, risk-scoring, security, pull-request, code-review,
devops, platform-engineering, gitops, change-management
```

**Longer description (optional)**

> Terraform Plan Verdict turns `terraform show -json` output into a clear change-risk verdict using jev,
> TypeSafe AI's System One model. It grades blast radius, destructiveness, and security impact, estimates
> data-loss risk, and posts a LOW/MEDIUM/HIGH/CRITICAL verdict with confidence to the job summary and your
> pull requests. Add risk labels, gate merges with `fail-on`, and consume the scores as step outputs. Only a
> redacted plan summary is sent for scoring — attribute values never leave your workflow.

## Pre-publish checklist

- [ ] `npm run build` committed; CI green on `main`.
- [ ] `README.md` examples use `nandotorres/terraform-plan-veredict@v1`.
- [ ] `action.yml` name, description, and branding are final.
- [ ] `TYPESAFE_API_KEY` usage documented for consumers.
- [ ] `v1.0.0` tag pushed and release published.
