# Terraform Plan Verdict

[![CI](https://github.com/nandotorres/terraform-plan-verdict/actions/workflows/ci.yml/badge.svg)](https://github.com/nandotorres/terraform-plan-verdict/actions/workflows/ci.yml)
[![CodeQL](https://github.com/nandotorres/terraform-plan-verdict/actions/workflows/codeql.yml/badge.svg)](https://github.com/nandotorres/terraform-plan-verdict/actions/workflows/codeql.yml)
[![Demo](https://github.com/nandotorres/terraform-plan-verdict/actions/workflows/demo.yml/badge.svg)](https://github.com/nandotorres/terraform-plan-verdict/actions/workflows/demo.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/nandotorres/terraform-plan-verdict/badge)](https://scorecard.dev/viewer/?uri=github.com/nandotorres/terraform-plan-verdict)

Most teams "review" Terraform with a trivial check: *does the plan contain `destroy`? then ping someone.*
This **extends that trivial check** into a graded, explained risk verdict — one that doesn't cry wolf over a
harmless delete and doesn't wave through the dangerous changes a `destroy` grep never sees.

It scores a **Terraform plan** across blast radius, destructiveness, and security impact, estimates data-loss
risk, and returns an overall `LOW` / `MEDIUM` / `HIGH` / `CRITICAL` verdict — surfaced in your pull requests:

- 🧾 Job summary
- 💬 Sticky PR comment
- 🏷️ PR labels
- 📤 Step outputs for the rest of your workflow

## Why not just grep for `destroy`?

Fair question — and for the simplest case, you don't need this. The default provider is **free, deterministic
rules, no AI**, so "has `destroy` → review" is already covered out of the box. But a binary tripwire is *both
too loud and too quiet*:

- **It cries wolf.** Destroying a `null_resource`, a log group, or a cache node is harmless. If every delete
  blocks or pings, reviewers learn to rubber-stamp — and the one dangerous destroy slips through.
- **It misses the scary plans that have no `destroy`.** These all pass a grep: opening a security group to
  `0.0.0.0/0`, flipping `encrypted` to `false`, widening an IAM policy to `*`, making a resource
  `publicly_accessible`, or an in-place `update` that causes downtime.
- **Not all destroys are equal.** Replacing a stateless worker and replacing the primary database both render
  as `replace`. You want *triage* (auto-merge / normal review / owner sign-off), not one tripwire.
- **The value is the workflow.** A grep gives you a boolean in a log. This gives a consistent verdict in the PR
  summary, a sticky comment, labels, a `fail-on` gate, and machine-readable outputs for later steps.

The optional AI providers aren't there to find the word `destroy`. They're for the judgment a rules table is
bad at — weighing resource semantics and blast radius, and explaining the risk in plain language for
non-infra reviewers. They're opt-in; ignore them and the free rules still beat a grep.

> **If your team genuinely only cares about `destroy`:** use `provider: rules` with `fail-on: high`. You get a
> better grep — it won't block a trivial `null_resource` delete, and it *will* catch the public-exposure change
> a grep misses — with zero AI and zero cost.

## Providers

The judgment layer is pluggable. Pick what fits — the default needs **no API key and makes no network calls**.

| `provider` | Cost | Needs | Notes |
| --- | --- | --- | --- |
| `rules` (default) | Free | nothing | Deterministic heuristics over the plan. Reproducible, offline. |
| `systemone` | Paid | API key | [jev](https://typesafe.ai) or any TypeSafe System One–compatible endpoint. Calibrated scores + confidence. |
| `openai` | Varies | API key* | Any OpenAI-compatible `/chat/completions` endpoint — OpenAI, **Anthropic**, **Gemini**, Groq, OpenRouter, Mistral, DeepSeek, or local **Ollama** / LM Studio. |

\* Local endpoints (e.g. Ollama) usually need no key.

### Using Anthropic, Gemini, or any other model

The `openai` provider works with any OpenAI-compatible endpoint — just set `base-url`, `model`, and `api-key`:

| Provider | `base-url` | example `model` |
| --- | --- | --- |
| OpenAI | *(default)* | `gpt-4o-mini` |
| Anthropic (Claude) | `https://api.anthropic.com/v1` | `claude-sonnet-4-5` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.0-flash` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-sonnet-4-5` |
| Mistral | `https://api.mistral.ai/v1` | `mistral-large-latest` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` |

```yaml
- uses: nandotorres/terraform-plan-verdict@v0
  with:
    plan-json: plan.json
    provider: openai
    base-url: https://api.anthropic.com/v1
    model: claude-sonnet-4-5
    api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

Strict JSON mode is requested automatically and retried without it for endpoints that don't support it (e.g. Gemini, Anthropic), so responses parse across providers.

### provider-options (headers / query / body)

For anything a specific provider needs, pass a small YAML (or JSON) map. It supports three keys:
`headers` (extra request headers), `query` (extra query-string params), and `body` (extra chat-completions
fields). This covers the long tail — Azure OpenAI, `anthropic-version`, OpenRouter attribution, token limits, etc.

```yaml
# Azure OpenAI
- uses: nandotorres/terraform-plan-verdict@v0
  with:
    plan-json: plan.json
    provider: openai
    base-url: https://my-resource.openai.azure.com/openai/deployments/gpt-4o
    model: gpt-4o
    provider-options: |
      headers:
        api-key: ${{ secrets.AZURE_OPENAI_KEY }}
      query:
        api-version: "2024-08-01-preview"
      body:
        max_tokens: 512
```

When using `systemone` or `openai`, only a **redacted plan summary** is sent — resource attribute *values are
dropped*; only change actions, types, and a few security flags are included. The `rules` provider sends nothing.

## See it in action

The [**Demo** workflow](https://github.com/nandotorres/terraform-plan-verdict/actions/workflows/demo.yml)
runs four real, cloud-free Terraform plans and posts each verdict to the job summary:

| Scenario | Verdict | Score |
| --- | --- | --- |
| low | 🟢 LOW | 17 |
| medium | 🟡 MEDIUM | 32 |
| high | 🟠 HIGH | 70 |
| critical | 🔴 CRITICAL | 88 |

See [`examples/`](examples/) for the scenarios.

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
| `plan-json` | _required_ | Path to the plan JSON — accepts both `terraform show -json` (single object) and `terraform plan -json` (NDJSON). |
| `provider` | `rules` | `rules`, `systemone`, or `openai`. |
| `api-key` | — | Key for the provider (not needed for `rules`). Falls back to `TYPESAFE_API_KEY` / `OPENAI_API_KEY`. |
| `model` | provider default | Model name (e.g. `jev-latest`, `gpt-4o-mini`, `llama3.1`). |
| `base-url` | provider default | API root for self-hosted/alternative endpoints. |
| `provider-options` | — | YAML/JSON pass-through with `headers`, `query`, `body` maps (see below). |
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
