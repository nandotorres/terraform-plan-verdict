import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyActions, loadPlan, summarizePlan, type PlanJson } from "../src/plan.js";

const plan = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/plan.json", import.meta.url)), "utf8"),
) as PlanJson;

describe("classifyActions", () => {
  it("detects replace from delete+create", () => {
    expect(classifyActions(["delete", "create"])).toBe("replace");
  });
  it("detects delete, create, update, noop", () => {
    expect(classifyActions(["delete"])).toBe("delete");
    expect(classifyActions(["create"])).toBe("create");
    expect(classifyActions(["update"])).toBe("update");
    expect(classifyActions(["no-op"])).toBe("noop");
  });
});

describe("loadPlan", () => {
  const showJson = readFileSync(
    fileURLToPath(new URL("./fixtures/plan.json", import.meta.url)),
    "utf8",
  );
  const ndjson = readFileSync(
    fileURLToPath(new URL("./fixtures/plan.ndjson", import.meta.url)),
    "utf8",
  );

  it("parses terraform show -json (single object)", () => {
    const p = loadPlan(showJson);
    expect(p.resource_changes?.length).toBeGreaterThan(0);
  });

  it("parses terraform plan -json (NDJSON stream)", () => {
    const p = loadPlan(ndjson);
    const s = summarizePlan(p, { maxResources: 0 });
    // the 'high' scenario: 3 replaces + 13 deletes
    expect(s.counts.replace).toBe(3);
    expect(s.counts.delete).toBe(13);
    expect(s.hasDestructiveChanges).toBe(true);
  });

  it("throws on unparseable input", () => {
    expect(() => loadPlan("not json at all")).toThrow();
  });
});

describe("summarizePlan", () => {
  const summary = summarizePlan(plan, { maxResources: 0 });

  it("counts actions correctly", () => {
    expect(summary.counts.replace).toBe(1);
    expect(summary.counts.update).toBe(1);
    expect(summary.counts.create).toBe(1);
    expect(summary.counts.noop).toBe(1);
  });

  it("flags destructive changes", () => {
    expect(summary.hasDestructiveChanges).toBe(true);
  });

  it("marks stateful resources", () => {
    const db = summary.resources.find((r) => r.address === "aws_db_instance.main");
    expect(db?.stateful).toBe(true);
    expect(db?.action).toBe("replace");
  });

  it("detects public-network security flag", () => {
    const sg = summary.resources.find((r) => r.address === "aws_security_group_rule.ingress");
    expect(sg?.securityFlags).toContain("public-network");
  });

  it("sorts most-risky first (replace before create)", () => {
    expect(summary.resources[0].action).toBe("replace");
  });
});
