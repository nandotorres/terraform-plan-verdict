# Examples

Runnable, **cloud-free** scenarios that produce real Terraform plans and exercise the full
green → yellow → orange → red range. They use only the `terraform_data`, `random`, and `local`
providers, so they `apply` and `plan` offline with no credentials.

Each scenario is one config parameterized by `var.phase`:

- `phase=base` — the "before" world (applied to create state).
- `phase=change` — the "after" world (the diff that gets scored).

## Run one

```sh
./examples/generate-plan.sh examples/high
# -> examples/high/plan.json

# score it with the free rules provider
terraform show -json examples/high/tfplan >/dev/null  # already produced plan.json
```

Then feed `plan.json` to the action (see the repo README), or run the whole set in CI via the
[`Demo` workflow](../.github/workflows/demo.yml), which posts each verdict to the job summary.

## Expected verdicts

Verified with the deterministic `rules` provider:

| Scenario | Plan | Verdict | Score |
| --- | --- | --- | --- |
| `low` | 6 creates | 🟢 LOW | 17 |
| `medium` | 10 creates, 3 updates | 🟡 MEDIUM | 32 |
| `high` | 13 deletes, 3 replaces | 🟠 HIGH | 70 |
| `critical` | 12 deletes, 7 replaces, firewall opened to `0.0.0.0/0` | 🔴 CRITICAL | 88 |

Scores are deterministic, so these are stable. Swapping in an AI provider (`systemone` / `openai`)
may shift them slightly based on the model's judgment.
