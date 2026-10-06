import type { PlanSummary } from "../plan.js";
import {
  aggregate,
  clamp,
  normalizeLevel,
  toState,
  verdictFromScore,
  type JudgeOptions,
  type Judgment,
  type Verdict,
} from "./types.js";

const DEFAULT_BASE = "https://api.openai.com/v1";

const SYSTEM_PROMPT = [
  "You are a Terraform change-risk reviewer.",
  "Given a redacted plan summary, rate the change and reply with ONLY a JSON object:",
  '{"blast_radius":0-4,"destructiveness":0-4,"security_impact":0-4,',
  '"data_loss_risk":0.0-1.0,"verdict":"LOW|MEDIUM|HIGH|CRITICAL"}.',
  "Scores are integers 0 (none) to 4 (severe). No prose, no code fences.",
].join(" ");

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface Parsed {
  blast_radius: number;
  destructiveness: number;
  security_impact: number;
  data_loss_risk: number;
  verdict: string;
}

function extractJson(content: string): Parsed {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model response.");
  return JSON.parse(content.slice(start, end + 1)) as Parsed;
}

function coerceVerdict(value: string, fallbackScore: number): Verdict {
  const v = String(value).toUpperCase();
  if (v === "LOW" || v === "MEDIUM" || v === "HIGH" || v === "CRITICAL") return v;
  return verdictFromScore(fallbackScore);
}

/**
 * Judge via any OpenAI-compatible /chat/completions endpoint:
 * OpenAI, Gemini, Anthropic (compat), Groq, OpenRouter, Mistral, DeepSeek,
 * Together, Ollama, LM Studio, ...
 */
export async function judgeWithOpenAI(
  summary: PlanSummary,
  opts: JudgeOptions,
): Promise<Judgment> {
  const doFetch = opts.fetch ?? fetch;
  const base = (opts.baseURL ?? DEFAULT_BASE).replace(/\/+$/, "");
  const query = opts.extra?.query ?? {};
  const qs = new URLSearchParams(query).toString();
  const url = `${base}/chat/completions${qs ? `?${qs}` : ""}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
    ...(opts.extra?.headers ?? {}),
  };
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(toState(summary)) },
  ];
  const body = (jsonMode: boolean) =>
    JSON.stringify({
      model: opts.model,
      temperature: 0,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      ...(opts.extra?.body ?? {}),
      messages,
    });

  // Request strict JSON mode first; some providers (Gemini, Anthropic compat)
  // reject response_format, so retry once without it (extractJson is tolerant).
  let res = await doFetch(url, { method: "POST", headers, body: body(true) });
  if (!res.ok && (res.status === 400 || res.status === 404 || res.status === 422)) {
    res = await doFetch(url, { method: "POST", headers, body: body(false) });
  }
  if (!res.ok) {
    throw new Error(`OpenAI-compatible endpoint returned ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as ChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from model.");

  const parsed = extractJson(content);
  const dimensions = {
    blastRadius: { score: clamp(parsed.blast_radius, 0, 4), normalized: normalizeLevel(parsed.blast_radius) },
    destructiveness: { score: clamp(parsed.destructiveness, 0, 4), normalized: normalizeLevel(parsed.destructiveness) },
    securityImpact: { score: clamp(parsed.security_impact, 0, 4), normalized: normalizeLevel(parsed.security_impact) },
  };
  const overallScore = aggregate(dimensions);

  return {
    provider: "openai",
    model: opts.model,
    verdict: coerceVerdict(parsed.verdict, overallScore),
    overallScore,
    dataLossRisk: clamp(Number(parsed.data_loss_risk) || 0, 0, 1),
    dimensions,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
  };
}
