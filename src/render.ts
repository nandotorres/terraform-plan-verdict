/** Markdown rendering for the job summary and PR comment. */
import type { Judgment, Verdict } from "./judge/index.js";
import type { PlanSummary } from "./plan.js";

export const COMMENT_MARKER = "<!-- terraform-plan-jev-score -->";

const BADGE: Record<Verdict, string> = {
  LOW: "🟢 LOW",
  MEDIUM: "🟡 MEDIUM",
  HIGH: "🟠 HIGH",
  CRITICAL: "🔴 CRITICAL",
};

function pct(n: number | undefined): string {
  return n === undefined ? "—" : `${Math.round(n * 100)}%`;
}

function bar(normalized: number): string {
  const filled = Math.round(normalized / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

export function renderMarkdown(j: Judgment, summary: PlanSummary): string {
  const c = summary.counts;
  const notable = summary.resources
    .filter((r) => r.action === "delete" || r.action === "replace" || r.securityFlags.length > 0)
    .slice(0, 15);

  const lines: string[] = [];
  lines.push(COMMENT_MARKER);
  lines.push(`## 🧑‍⚖️ Terraform Plan Verdict — ${BADGE[j.verdict]}`);
  lines.push("");
  const confidence = j.verdictConfidence === undefined ? "" : ` · **Confidence:** ${pct(j.verdictConfidence)}`;
  lines.push(
    `**Overall risk score:** \`${j.overallScore}/100\`${confidence} · ` +
      `**Data-loss risk:** ${pct(j.dataLossRisk)}`,
  );
  lines.push("");
  lines.push("| Dimension | Score | Confidence |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| Destructiveness | \`${bar(j.dimensions.destructiveness.normalized)}\` ${j.dimensions.destructiveness.normalized} | ${pct(j.dimensions.destructiveness.confidence)} |`,
  );
  lines.push(
    `| Security impact | \`${bar(j.dimensions.securityImpact.normalized)}\` ${j.dimensions.securityImpact.normalized} | ${pct(j.dimensions.securityImpact.confidence)} |`,
  );
  lines.push(
    `| Blast radius | \`${bar(j.dimensions.blastRadius.normalized)}\` ${j.dimensions.blastRadius.normalized} | ${pct(j.dimensions.blastRadius.confidence)} |`,
  );
  lines.push("");
  lines.push(
    `**Plan changes:** 🟩 ${c.create} create · 🟦 ${c.update} update · ` +
      `♻️ ${c.replace} replace · 🟥 ${c.delete} delete`,
  );
  lines.push("");

  if (notable.length > 0) {
    lines.push("<details><summary>Notable changes</summary>");
    lines.push("");
    lines.push("| Resource | Action | Flags |");
    lines.push("| --- | --- | --- |");
    for (const r of notable) {
      const flags = [r.stateful ? "stateful" : "", ...r.securityFlags].filter(Boolean).join(", ");
      lines.push(`| \`${r.address}\` | ${r.action} | ${flags || "—"} |`);
    }
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  if (summary.truncated) {
    lines.push("> ℹ️ Resource list was truncated for scoring (see `max-resources`).");
    lines.push("");
  }

  const tokens = j.usage ? ` · ${j.usage.inputTokens + j.usage.outputTokens} tokens` : "";
  lines.push(`<sub>Judged by ${j.provider} (\`${j.model}\`)${tokens}</sub>`);

  return lines.join("\n");
}

export function riskLabels(j: Judgment, prefix: string): string[] {
  const labels = [`${prefix}risk:${j.verdict.toLowerCase()}`];
  if (j.dataLossRisk >= 0.5) labels.push(`${prefix}data-loss`);
  return labels;
}
