import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk";
import type { PlanSummary } from "../plan.js";
import {
  aggregate,
  normalizeLevel,
  toState,
  type JudgeOptions,
  type Judgment,
} from "./types.js";

// System One questions. Works with jev and any TypeSafe System One–compatible endpoint.
const questions = {
  blast_radius: score(
    "How broad is the impact of this plan across resources, resource types, and providers?",
    [
      "Trivial: no-ops only, or a single low-impact resource.",
      "Small: a handful of resources of a single type.",
      "Moderate: several resources or a few distinct types.",
      "Large: many resources spanning multiple providers.",
      "Massive: sweeping changes across much of the estate.",
    ],
  ),
  destructiveness: score(
    "How destructive is this plan in terms of downtime, resource recreation, and deletion?",
    [
      "None: purely additive or no-op changes.",
      "Low: in-place updates with no downtime.",
      "Moderate: some recreation or deletion of stateless resources.",
      "High: recreation or deletion affecting stateful resources.",
      "Severe: widespread deletion/replacement of critical stateful resources.",
    ],
  ),
  data_loss_risk: noul(
    "Could applying this plan cause irreversible data loss (e.g. destroying or replacing databases, volumes, or buckets)?",
  ),
  security_impact: score(
    "How much does this plan change the security posture (IAM, network exposure, encryption, secrets)?",
    [
      "None: no security-relevant changes.",
      "Low: minor security-adjacent changes with no exposure increase.",
      "Moderate: meaningful IAM or network changes worth a review.",
      "High: broadens access, opens networks, or touches secrets.",
      "Severe: exposes resources publicly, disables encryption, or grants broad privilege.",
    ],
  ),
  verdict: choice("What is the overall change-risk verdict for applying this plan?", {
    LOW: "Safe, routine change suitable for auto-merge.",
    MEDIUM: "Needs a normal peer review before merge.",
    HIGH: "Needs careful review by a resource owner.",
    CRITICAL: "Dangerous; should block merge or require explicit sign-off.",
  }),
} as const;

export async function judgeWithSystemOne(
  summary: PlanSummary,
  opts: JudgeOptions,
): Promise<Judgment> {
  const client = new TypeSafeClient({
    apiKey: opts.apiKey,
    defaultModel: opts.model,
    baseURL: opts.baseURL,
    fetch: opts.fetch,
    defaultHeaders: opts.extra?.headers,
  });

  const { model, answers, usage } = await client.systemOne({ state: toState(summary), questions });

  const dimensions = {
    blastRadius: {
      score: answers.blast_radius.score,
      confidence: answers.blast_radius.confidence,
      normalized: normalizeLevel(answers.blast_radius.score),
    },
    destructiveness: {
      score: answers.destructiveness.score,
      confidence: answers.destructiveness.confidence,
      normalized: normalizeLevel(answers.destructiveness.score),
    },
    securityImpact: {
      score: answers.security_impact.score,
      confidence: answers.security_impact.confidence,
      normalized: normalizeLevel(answers.security_impact.score),
    },
  };

  return {
    provider: "systemone",
    model,
    verdict: answers.verdict.choice,
    verdictConfidence: answers.verdict.confidence,
    overallScore: aggregate(dimensions),
    dataLossRisk: answers.data_loss_risk.noul,
    dimensions,
    usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
  };
}
