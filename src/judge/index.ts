import type { PlanSummary } from "../plan.js";
import { judgeWithOpenAI } from "./openai.js";
import { judgeWithRules } from "./rules.js";
import { judgeWithSystemOne } from "./systemone.js";
import type { JudgeOptions, Judgment, ProviderName } from "./types.js";

export type { DimensionScore, Judgment, ProviderName, Verdict } from "./types.js";
export { verdictAtOrAbove } from "./types.js";

export function judgePlan(
  provider: ProviderName,
  summary: PlanSummary,
  opts: JudgeOptions,
): Promise<Judgment> | Judgment {
  switch (provider) {
    case "rules":
      return judgeWithRules(summary);
    case "systemone":
      return judgeWithSystemOne(summary, opts);
    case "openai":
      return judgeWithOpenAI(summary, opts);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
