import { readFileSync } from "node:fs";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { judgePlan, verdictAtOrAbove, type ProviderName, type Verdict } from "./judge/index.js";
import { parse as parseYaml } from "yaml";
import { loadPlan, summarizePlan } from "./plan.js";
import type { ProviderExtra } from "./judge/types.js";
import { renderMarkdown, riskLabels } from "./render.js";
import { applyLabels, getPrContext, upsertComment } from "./github.js";

function boolInput(name: string): boolean {
  return core.getInput(name).toLowerCase() === "true";
}

async function run(): Promise<void> {
  const planPath = core.getInput("plan-json", { required: true });
  const provider = (core.getInput("provider") || "rules").toLowerCase() as ProviderName;
  const apiKey = core.getInput("api-key") || process.env.TYPESAFE_API_KEY || process.env.OPENAI_API_KEY;
  const model = core.getInput("model") || (provider === "systemone" ? "jev-latest" : "");
  const baseURL = core.getInput("base-url") || process.env.TYPESAFE_BASE_URL || process.env.OPENAI_BASE_URL;

  let extra: ProviderExtra | undefined;
  const optsRaw = core.getInput("provider-options");
  if (optsRaw.trim()) {
    try {
      const parsed = parseYaml(optsRaw) as ProviderExtra;
      if (parsed && typeof parsed === "object") extra = parsed;
    } catch (e) {
      core.setFailed(`provider-options is not valid YAML/JSON: ${(e as Error).message}`);
      return;
    }
  }
  const maxResources = Number.parseInt(core.getInput("max-resources") || "200", 10);

  let planRaw: string;
  try {
    planRaw = readFileSync(planPath, "utf8");
  } catch (e) {
    core.setFailed(`Could not read plan-json at '${planPath}': ${(e as Error).message}`);
    return;
  }

  let plan;
  try {
    plan = loadPlan(planRaw);
  } catch (e) {
    core.setFailed(`Could not parse plan input: ${(e as Error).message}`);
    return;
  }

  const summary = summarizePlan(plan, { maxResources: Number.isFinite(maxResources) ? maxResources : 200 });

  if (summary.totalChanges === 0) {
    core.info("No resource changes in plan; nothing to judge.");
    core.setOutput("verdict", "LOW");
    core.setOutput("overall-score", "0");
    core.setOutput("has-destructive-changes", "false");
    return;
  }

  core.info(`Judging plan with '${provider}': ${summary.totalChanges} changes.`);
  const judgment = await judgePlan(provider, summary, { apiKey, model, baseURL, extra });

  const markdown = renderMarkdown(judgment, summary);

  // Outputs for downstream steps.
  core.setOutput("verdict", judgment.verdict);
  core.setOutput("verdict-confidence", (judgment.verdictConfidence ?? 1).toFixed(4));
  core.setOutput("provider", judgment.provider);
  core.setOutput("overall-score", String(judgment.overallScore));
  core.setOutput("scores-json", JSON.stringify(judgment));
  core.setOutput("data-loss-risk", judgment.dataLossRisk.toFixed(4));
  core.setOutput("has-destructive-changes", String(summary.hasDestructiveChanges));
  core.setOutput("resources-created", String(summary.counts.create));
  core.setOutput("resources-updated", String(summary.counts.update));
  core.setOutput("resources-deleted", String(summary.counts.delete));
  core.setOutput("resources-replaced", String(summary.counts.replace));

  if (boolInput("summary")) {
    await core.summary.addRaw(markdown).write();
  }

  const wantsComment = boolInput("comment");
  const wantsLabels = boolInput("labels");
  // Only resolve PR context when we actually need it (avoids requiring
  // GITHUB_REPOSITORY for summary-only / local runs).
  const prCtx = wantsComment || wantsLabels ? getPrContext() : null;

  if ((wantsComment || wantsLabels) && prCtx) {
    const token = core.getInput("github-token");
    const octokit = github.getOctokit(token);

    if (wantsComment) {
      const mode = (core.getInput("comment-mode") || "upsert") as "upsert" | "new";
      try {
        const url = await upsertComment(octokit, prCtx, markdown, mode);
        core.setOutput("comment-url", url);
      } catch (e) {
        core.warning(`Failed to post PR comment: ${(e as Error).message}`);
      }
    }

    if (wantsLabels) {
      const prefix = core.getInput("label-prefix") || "plan/";
      try {
        await applyLabels(octokit, prCtx, riskLabels(judgment, prefix), prefix);
      } catch (e) {
        core.warning(`Failed to apply labels: ${(e as Error).message}`);
      }
    }
  } else if ((wantsComment || wantsLabels) && !prCtx) {
    core.info("Not a pull_request event; skipping comment/labels.");
  }

  const failOn = (core.getInput("fail-on") || "none").toUpperCase();
  if (failOn !== "NONE" && verdictAtOrAbove(judgment.verdict, failOn as Verdict)) {
    core.setFailed(`Verdict ${judgment.verdict} is at or above fail-on threshold ${failOn}.`);
  }
}

run().catch((e) => core.setFailed(e instanceof Error ? e.message : String(e)));
