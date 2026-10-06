import type { PlanSummary } from "../plan.js";
import { aggregate, clamp, maxVerdict, verdictFromScore, type Judgment } from "./types.js";

const SECURITY_WEIGHTS: Record<string, number> = {
  "public-network": 30,
  "publicly-accessible": 25,
  "encryption-disabled": 25,
  iam: 15,
  "secret-material": 15,
};

// Turn a 0..100 heuristic score back into a 0..4 rubric level for display parity.
function toLevel(normalized: number): number {
  return Math.round((normalized / 100) * 4);
}

/** Deterministic, offline scoring. Free, no credentials, fully reproducible. */
export function judgeWithRules(summary: PlanSummary): Judgment {
  const { counts, resources } = summary;

  const statefulDestroy = resources.filter(
    (r) => r.stateful && (r.action === "delete" || r.action === "replace"),
  ).length;

  const destructiveRaw =
    counts.delete * 20 + counts.replace * 12 + counts.update * 2 + statefulDestroy * 25;
  const destructiveNorm = clamp(destructiveRaw, 0, 100);

  const securityRaw = resources.reduce(
    (sum, r) => sum + r.securityFlags.reduce((s, f) => s + (SECURITY_WEIGHTS[f] ?? 10), 0),
    0,
  );
  const securityNorm = clamp(securityRaw, 0, 100);

  const distinctTypes = new Set(resources.map((r) => r.type)).size;
  const distinctProviders = new Set(resources.map((r) => r.provider)).size;
  const blastRaw = summary.totalChanges * 4 + distinctTypes * 6 + distinctProviders * 10;
  const blastNorm = clamp(blastRaw, 0, 100);

  const dimensions = {
    destructiveness: { score: toLevel(destructiveNorm), normalized: destructiveNorm },
    securityImpact: { score: toLevel(securityNorm), normalized: securityNorm },
    blastRadius: { score: toLevel(blastNorm), normalized: blastNorm },
  };

  const overallScore = aggregate(dimensions);

  const dataLossRisk =
    statefulDestroy > 0
      ? clamp(0.6 + 0.1 * (statefulDestroy - 1), 0, 0.95)
      : counts.delete > 0
        ? 0.15
        : 0.02;

  let verdict = verdictFromScore(overallScore);
  if (dataLossRisk >= 0.5) verdict = maxVerdict(verdict, "HIGH");

  return {
    provider: "rules",
    model: "rules",
    verdict,
    overallScore,
    dataLossRisk,
    dimensions,
  };
}
