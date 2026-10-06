import { TypeSafeClient, choice, noul, score, type EntryType } from "@typesafe-ai/sdk";
import type { PlanSummary } from "./plan.js";

export type Verdict = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Judgment {
  model: string;
  verdict: Verdict;
  verdictConfidence: number;
  overallScore: number; // 0..100
  dataLossRisk: number; // 0..1
  dimensions: {
    blastRadius: DimensionScore;
    destructiveness: DimensionScore;
    securityImpact: DimensionScore;
  };
  usage: { inputTokens: number; outputTokens: number };
}

export interface DimensionScore {
  score: number; // raw jev score (0..4)
  confidence: number;
  normalized: number; // 0..100
}

const WEIGHTS = { destructiveness: 0.4, securityImpact: 0.3, blastRadius: 0.3 };
const MAX_RUBRIC = 4; // rubrics have 5 levels (indices 0..4)

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

function normalize(raw: number): number {
  return Math.round((Math.max(0, Math.min(MAX_RUBRIC, raw)) / MAX_RUBRIC) * 100);
}

export interface JevOptions {
  apiKey?: string;
  model: string;
}

export async function judgePlan(summary: PlanSummary, opts: JevOptions): Promise<Judgment> {
  const client = new TypeSafeClient({
    apiKey: opts.apiKey,
    defaultModel: opts.model,
  });

  const state = {
    counts: { ...summary.counts },
    has_destructive_changes: summary.hasDestructiveChanges,
    total_changes: summary.totalChanges,
    truncated: summary.truncated,
    resources: summary.resources.map((r) => ({
      address: r.address,
      type: r.type,
      provider: r.provider,
      action: r.action,
      stateful: r.stateful,
      security_flags: r.securityFlags,
    })),
  } as EntryType;

  const { model, answers, usage } = await client.systemOne({ state, questions });

  const blastRadius: DimensionScore = {
    score: answers.blast_radius.score,
    confidence: answers.blast_radius.confidence,
    normalized: normalize(answers.blast_radius.score),
  };
  const destructiveness: DimensionScore = {
    score: answers.destructiveness.score,
    confidence: answers.destructiveness.confidence,
    normalized: normalize(answers.destructiveness.score),
  };
  const securityImpact: DimensionScore = {
    score: answers.security_impact.score,
    confidence: answers.security_impact.confidence,
    normalized: normalize(answers.security_impact.score),
  };

  const overallScore = Math.round(
    WEIGHTS.destructiveness * destructiveness.normalized +
      WEIGHTS.securityImpact * securityImpact.normalized +
      WEIGHTS.blastRadius * blastRadius.normalized,
  );

  return {
    model,
    verdict: answers.verdict.choice,
    verdictConfidence: answers.verdict.confidence,
    overallScore,
    dataLossRisk: answers.data_loss_risk.noul,
    dimensions: { blastRadius, destructiveness, securityImpact },
    usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens },
  };
}

const ORDER: Record<Verdict, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export function verdictAtOrAbove(verdict: Verdict, threshold: Verdict): boolean {
  return ORDER[verdict] >= ORDER[threshold];
}
