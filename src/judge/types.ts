import type { PlanSummary } from "../plan.js";

export type Verdict = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ProviderName = "rules" | "systemone" | "openai";

export interface DimensionScore {
  /** Raw 0..4 rubric level. */
  score: number;
  /** 0..100 normalized score. */
  normalized: number;
  /** Model-reported confidence (0..1), when the provider supplies one. */
  confidence?: number;
}

export interface Judgment {
  provider: ProviderName;
  model: string;
  verdict: Verdict;
  verdictConfidence?: number;
  overallScore: number; // 0..100
  dataLossRisk: number; // 0..1
  dimensions: {
    blastRadius: DimensionScore;
    destructiveness: DimensionScore;
    securityImpact: DimensionScore;
  };
  usage?: { inputTokens: number; outputTokens: number };
}

/** Provider-specific pass-through options (from the `provider-options` input). */
export interface ProviderExtra {
  /** Extra request headers (e.g. anthropic-version, Azure api-key). */
  headers?: Record<string, string>;
  /** Extra query-string params (e.g. Azure api-version). */
  query?: Record<string, string>;
  /** Extra request-body fields merged into the chat-completions call (e.g. max_tokens). */
  body?: Record<string, unknown>;
}

export interface JudgeOptions {
  apiKey?: string;
  model: string;
  baseURL?: string;
  fetch?: typeof fetch;
  extra?: ProviderExtra;
}

export const MAX_LEVEL = 4; // rubrics have 5 levels (0..4)
export const WEIGHTS = { destructiveness: 0.4, securityImpact: 0.3, blastRadius: 0.3 };

const ORDER: Record<Verdict, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function normalizeLevel(level: number): number {
  return Math.round((clamp(level, 0, MAX_LEVEL) / MAX_LEVEL) * 100);
}

export function aggregate(d: Judgment["dimensions"]): number {
  return Math.round(
    WEIGHTS.destructiveness * d.destructiveness.normalized +
      WEIGHTS.securityImpact * d.securityImpact.normalized +
      WEIGHTS.blastRadius * d.blastRadius.normalized,
  );
}

export function verdictFromScore(score: number): Verdict {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

export function verdictAtOrAbove(verdict: Verdict, threshold: Verdict): boolean {
  return ORDER[verdict] >= ORDER[threshold];
}

export function maxVerdict(a: Verdict, b: Verdict): Verdict {
  return ORDER[a] >= ORDER[b] ? a : b;
}

/** The state payload sent to AI providers. Attribute values are never included. */
export function toState(summary: PlanSummary) {
  return {
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
  };
}
