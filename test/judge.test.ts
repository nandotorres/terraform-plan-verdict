import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { judgePlan } from "../src/judge/index.js";
import { summarizePlan, type PlanJson } from "../src/plan.js";

const plan = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/plan.json", import.meta.url)), "utf8"),
) as PlanJson;
const summary = summarizePlan(plan, { maxResources: 0 });

describe("rules provider (free, deterministic)", () => {
  it("scores the fixture plan without any network or key", () => {
    const j = judgePlan("rules", summary, { model: "" });
    if (j instanceof Promise) throw new Error("rules should be synchronous");

    expect(j.provider).toBe("rules");
    // stateful DB replace -> elevated data-loss risk forces at least HIGH.
    expect(j.dataLossRisk).toBeCloseTo(0.6);
    expect(j.verdict).toBe("HIGH");
    expect(j.dimensions.securityImpact.normalized).toBe(30); // public-network flag
    expect(j.overallScore).toBeGreaterThan(0);
  });
});

describe("openai provider (fake transport, free)", () => {
  it("parses an OpenAI-compatible response into a judgment", async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  blast_radius: 2,
                  destructiveness: 4,
                  security_impact: 3,
                  data_loss_risk: 0.9,
                  verdict: "CRITICAL",
                }),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch;

    const j = await judgePlan("openai", summary, {
      apiKey: "test",
      model: "gpt-4o-mini",
      baseURL: "https://example.test/v1",
      fetch: fakeFetch,
    });

    expect(j.provider).toBe("openai");
    expect(j.verdict).toBe("CRITICAL");
    expect(j.dimensions.securityImpact.normalized).toBe(75);
    expect(j.dimensions.destructiveness.normalized).toBe(100);
    // 0.4*100 + 0.3*75 + 0.3*50 = 77.5 -> 78
    expect(j.overallScore).toBe(78);
    expect(j.dataLossRisk).toBeCloseTo(0.9);
  });

  it("applies provider-options (headers, query, body) to the request", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const spyFetch = (async (url: string, init?: RequestInit) => {
      captured = { url, init: init ?? {} };
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"blast_radius":0,"destructiveness":0,"security_impact":0,"data_loss_risk":0,"verdict":"LOW"}' } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    await judgePlan("openai", summary, {
      apiKey: "test",
      model: "x",
      baseURL: "https://example.test/v1",
      fetch: spyFetch,
      extra: {
        headers: { "anthropic-version": "2023-06-01" },
        query: { "api-version": "2024-08-01" },
        body: { max_tokens: 512 },
      },
    });

    expect(captured?.url).toContain("api-version=2024-08-01");
    const headers = captured?.init.headers as Record<string, string>;
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(JSON.parse(String(captured?.init.body))).toMatchObject({ max_tokens: 512 });
  });
});
