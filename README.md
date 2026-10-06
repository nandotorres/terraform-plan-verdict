# Terraform Plan Verdict

Score a **Terraform plan** with **[jev](https://typesafe.ai) (TypeSafe AI)** and surface a clear change-risk
verdict in your pull requests.

- 🧾 Job summary
- 💬 Sticky PR comment
- 🏷️ PR labels
- 📤 Step outputs for the rest of your workflow

It grades the plan across blast radius, destructiveness, and security impact, estimates data-loss risk, and
returns an overall `LOW` / `MEDIUM` / `HIGH` / `CRITICAL` verdict with confidence.

Only a compact, redacted summary of the plan is sent for scoring — resource attribute **values are dropped**;
only change actions, types, and a few security flags are included.

## Quick start

```yaml
name: terraform
on: pull_request

jobs:
  plan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3

      - run: terraform init
      - run: terraform plan -out=tfplan
      - run: terraform show -json tfplan > plan.json

      - uses: nandotorres/terraform-plan-veredict@v1
        with:
          plan-json: plan.json
          typesafe-api-key: ${{ secrets.TYPESAFE_API_KEY }}
```

## Examples

### Comment, label, and block risky merges

```yaml
- uses: nandotorres/terraform-plan-veredict@v1
  with:
    plan-json: plan.json
    typesafe-api-key: ${{ secrets.TYPESAFE_API_KEY }}
    comment: true
    labels: true
    fail-on: critical
```

### Use the verdict in later steps

```yaml
- uses: nandotorres/terraform-plan-veredict@v1
  id: verdict
  with:
    plan-json: plan.json
    typesafe-api-key: ${{ secrets.TYPESAFE_API_KEY }}

- if: steps.verdict.outputs.has-destructive-changes == 'true'
  run: echo "Destructive plan — ${{ steps.verdict.outputs.verdict }} (${{ steps.verdict.outputs.overall-score }}/100)"

- if: steps.verdict.outputs.verdict == 'CRITICAL'
  run: ./scripts/page-oncall.sh
```

### Summary only (no PR writes)

```yaml
- uses: nandotorres/terraform-plan-veredict@v1
  with:
    plan-json: plan.json
    typesafe-api-key: ${{ secrets.TYPESAFE_API_KEY }}
    comment: false
    labels: false
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `plan-json` | _required_ | Path to `terraform show -json` output. |
| `typesafe-api-key` | `TYPESAFE_API_KEY` env | jev / TypeSafe AI API key. |
| `model` | `jev-latest` | jev model. |
| `github-token` | `${{ github.token }}` | Token for comments and labels. |
| `comment` | `true` | Post the verdict as a PR comment. |
| `comment-mode` | `upsert` | `upsert` (one sticky comment) or `new`. |
| `labels` | `false` | Apply risk labels to the PR. |
| `label-prefix` | `plan/` | Prefix for applied labels. |
| `fail-on` | `none` | Fail the job at/above `medium`, `high`, or `critical`. |
| `summary` | `true` | Write to the job step summary. |
| `max-resources` | `200` | Cap resources sent for scoring (`0` = no cap). |

## Outputs

| Output | Description |
| --- | --- |
| `verdict` | `LOW` \| `MEDIUM` \| `HIGH` \| `CRITICAL` |
| `verdict-confidence` | Confidence in the verdict (0..1) |
| `overall-score` | Aggregated risk score, 0..100 |
| `scores-json` | Full per-dimension breakdown |
| `data-loss-risk` | Probability of irreversible data loss (0..1) |
| `has-destructive-changes` | `true` if any delete/replace |
| `resources-created` / `-updated` / `-deleted` / `-replaced` | Change counts |
| `comment-url` | URL of the posted comment |

## Permissions

`comment` and `labels` need write access to pull requests:

```yaml
permissions:
  contents: read
  pull-requests: write
```

Comments and labels are skipped automatically on non-`pull_request` events.

## Security

Security is a first-class concern — both for what the action sends and for how it is built:

- Only a **redacted plan summary** is scored; resource attribute values never leave your workflow.
- All workflows run least-privilege (`permissions: {}` by default), with third-party actions **pinned to commit SHAs** and runners hardened via `step-security/harden-runner`.
- Every change is checked with `npm audit`, CodeQL, Dependency Review, and OpenSSF Scorecard; releases carry verifiable build provenance.

See [SECURITY.md](SECURITY.md) for the full posture and how to verify a release.

## Development

```sh
npm ci
npm run typecheck
npm test          # parsing tests, no network calls
npm run build     # bundle src -> dist/ (commit dist/)
```

`dist/` is committed because GitHub Actions runs the bundled output directly.

## License

MIT
