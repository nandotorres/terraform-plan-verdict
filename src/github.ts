/** PR comment (sticky upsert) and label handling via Octokit. */
import * as github from "@actions/github";
import { COMMENT_MARKER } from "./render.js";

type Octokit = ReturnType<typeof github.getOctokit>;

export interface PrContext {
  owner: string;
  repo: string;
  prNumber: number;
}

export function getPrContext(): PrContext | null {
  const { owner, repo } = github.context.repo;
  const pr = github.context.payload.pull_request?.number;
  if (!pr) return null;
  return { owner, repo, prNumber: pr };
}

export async function upsertComment(
  octokit: Octokit,
  ctx: PrContext,
  body: string,
  mode: "upsert" | "new",
): Promise<string> {
  if (mode === "upsert") {
    const existing = await octokit.paginate(octokit.rest.issues.listComments, {
      owner: ctx.owner,
      repo: ctx.repo,
      issue_number: ctx.prNumber,
      per_page: 100,
    });
    const found = existing.find((c) => c.body?.includes(COMMENT_MARKER));
    if (found) {
      const { data } = await octokit.rest.issues.updateComment({
        owner: ctx.owner,
        repo: ctx.repo,
        comment_id: found.id,
        body,
      });
      return data.html_url;
    }
  }
  const { data } = await octokit.rest.issues.createComment({
    owner: ctx.owner,
    repo: ctx.repo,
    issue_number: ctx.prNumber,
    body,
  });
  return data.html_url;
}

export async function applyLabels(
  octokit: Octokit,
  ctx: PrContext,
  labels: string[],
  prefix: string,
): Promise<void> {
  // Remove previously-applied labels with our prefix to avoid stale risk labels.
  const current = await octokit.paginate(octokit.rest.issues.listLabelsOnIssue, {
    owner: ctx.owner,
    repo: ctx.repo,
    issue_number: ctx.prNumber,
    per_page: 100,
  });
  const stale = current
    .map((l) => l.name)
    .filter((name) => name.startsWith(prefix) && !labels.includes(name));
  for (const name of stale) {
    await octokit.rest.issues.removeLabel({
      owner: ctx.owner,
      repo: ctx.repo,
      issue_number: ctx.prNumber,
      name,
    });
  }
  if (labels.length > 0) {
    await octokit.rest.issues.addLabels({
      owner: ctx.owner,
      repo: ctx.repo,
      issue_number: ctx.prNumber,
      labels,
    });
  }
}
