# Terraform Plan Verdict

Score a **Terraform plan** and surface a clear change-risk verdict in your pull requests:

- 🧾 Job summary
- 💬 Sticky PR comment
- 🏷️ PR labels
- 📤 Step outputs for the rest of your workflow

It grades the plan across blast radius, destructiveness, and security impact, estimates data-loss risk, and
returns an overall `LOW` / `MEDIUM` / `HIGH` / `CRITICAL` verdict.

## Providers

The judgment layer is pluggable. Pick what fits — the default needs **no API key and makes no network calls**.

| `provider` | Cost | Needs | Notes |
| --- | --- | --- | --- |
| `rules` (default) | Free | nothing | Deterministic heuristics over the plan. Reproducible, offline. |
| `systemone` | Paid | API key | [jev](https://typesafe.ai) or any TypeSafe System One–compatible endpoint. Calibrated scores + confidence. |
| `openai` | Varies | API key* | Any OpenAI-compatible `/chat/completions` endpoint — OpenAI, Groq, OpenRouter, or local **Ollama** / LM Studio. |

\* Local endpoints (e.g. Ollama) usually need no key.

When using `systemone` or `openai`, only a **redacted plan summary** is sent — resource attribute *values are
dropped*; only change actions, types, and a few security flags are included. The `rules` provider sends nothing.

## Quick start (free, no key)

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

      - uses: nandotorres/terraform-plan-verdict@v1
        with:
          plan-json: plan.json          # provider defaults to 'rules'
          comment: true
          labels: true
          fail-on: critical
```

## Examples

### jev / TypeSafe System One

```yaml
- uses: nandotorres/terraform-plan-verdict@v1
  with:
    plan-json: plan.json
    provider: systemone
    model: jev-latest
    api-key: ${{ secrets.TYPESAFE_API_KEY }}
```

### Any OpenAI-compatible model (OpenAI, Groq, OpenRouter)

```yaml
- uses: nandotorres/terraform-plan-verdict@v1
  with:
    plan-json: plan.json
    provider: openai
    model: gpt-4o-mini
    api-key: ${{ secrets.OPENAI_API_KEY }}
    # base-url: https://api.groq.com/openai/v1   # or any compatible endpoint
```

### Local model with Ollama (free, self-hosted)

```yaml
- uses: nandotorres/terraform-plan-verdict@v1
  with:
    plan-json: plan.json
    provider: openai
    model: llama3.1
    base-url: http://localhost:11434/v1
```

### Use the verdict in later steps

```yaml
- uses: nandotorres/terraform-plan-verdict@v1
  id: verdict
  with:
    plan-json: plan.json

- if: steps.verdict.outputs.verdict == 'CRITICAL'
  run: ./scripts/page-oncall.sh
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `plan-json` | _required_ | Path to `terraform show -json` output. |
| `provider` | `rules` | `rules`, `systemone`, or `openai`. |
| `api-key` | — | Key for the provider (not needed for `rules`). Falls back to `TYPESAFE_API_KEY` / `OPENAI_API_KEY`. |
| `model` | provider default | Model name (e.g. `jev-latest`, `gpt-4o-mini`, `llama3.1`). |
| `base-url` | provider default | API root for self-hosted/alternative endpoints. |
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
| `provider` | Provider that produced the judgment |
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

- `rules` runs fully offline. AI providers receive only a **redacted plan summary** (no attribute values).
- All workflows run least-privilege (`permissions: {}` by default), with third-party actions **pinned to commit SHAs** and runners hardened via `step-security/harden-runner`.
- Every change is checked with `npm audit`, CodeQL, Dependency Review, and OpenSSF Scorecard; releases carry verifiable build provenance.

See [SECURITY.md](SECURITY.md) for the full posture and how to verify a release.

## Development

```sh
npm ci
npm run typecheck
npm test          # rules + provider tests run with a fake transport (no network, no keys)
npm run build     # bundle src -> dist/ (commit dist/)
```

`dist/` is committed because GitHub Actions runs the bundled output directly.

## License

MIT
