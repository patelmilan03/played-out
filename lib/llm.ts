import type { Roast } from "./types";

type Provider = "groq" | "gemini";

const KEY: Record<Provider, string> = { groq: "GROQ_API_KEY", gemini: "GEMINI_API_KEY" };

// Free-tier model lineups change without notice. Model names are optional: when
// unset, or when the configured one 404s, ask the provider what it serves and pick
// the best chat model by these preferences (earlier = better).
const GROQ_PREFS = [/gpt-oss-120b/, /llama-4/, /llama-3\.3-70b/, /kimi/, /qwen/, /70b/, /gpt-oss-20b/];
const GROQ_NOT_CHAT = /whisper|guard|safeguard|orpheus|tts|playai|allam|compound/i;
const GEMINI_PREFS = [/^gemini-[\d.]+-flash$/, /^gemini-flash-latest$/, /^gemini-[\d.]+-flash/, /^gemini-[\d.]+-pro$/];
const GEMINI_NOT_CHAT = /lite|image|tts|live|embedding|audio|thinking|exp/i;

const discovered: Partial<Record<Provider, string>> = {};

class ModelNotFound extends Error {}

function rank(ids: string[], prefs: RegExp[]): string | undefined {
  // Newest-looking version first within each preference tier.
  const sorted = [...ids].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const p of prefs) {
    const hit = sorted.find((id) => p.test(id));
    if (hit) return hit;
  }
  return sorted[0];
}

async function discoverModel(provider: Provider): Promise<string> {
  if (discovered[provider]) return discovered[provider]!;
  let ids: string[];
  if (provider === "groq") {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    });
    if (!res.ok) throw new Error(`Groq model list ${res.status}: ${await res.text()}`);
    const json: { data: { id: string; active?: boolean }[] } = await res.json();
    ids = json.data.filter((m) => m.active !== false && !GROQ_NOT_CHAT.test(m.id)).map((m) => m.id);
  } else {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    });
    if (!res.ok) throw new Error(`Gemini model list ${res.status}: ${await res.text()}`);
    const json: { models: { name: string; supportedGenerationMethods?: string[] }[] } = await res.json();
    ids = json.models
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((id) => id.startsWith("gemini") && !GEMINI_NOT_CHAT.test(id));
  }
  const pick = rank(ids, provider === "groq" ? GROQ_PREFS : GEMINI_PREFS);
  if (!pick) throw new Error(`No usable ${provider} chat model found`);
  console.log(`[llm] using discovered ${provider} model: ${pick}`);
  return (discovered[provider] = pick);
}

async function callGroq(model: string, system: string, user: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 1,
      response_format: { type: "json_object" },
      // gpt-oss models are reasoning models; low effort keeps latency down.
      ...(model.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (res.status === 404) throw new ModelNotFound(`Groq 404: ${await res.text()}`);
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

async function callGemini(model: string, system: string, user: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 1, responseMimeType: "application/json" },
    }),
  });
  if (res.status === 404) throw new ModelNotFound(`Gemini 404: ${await res.text()}`);
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
}

// Models ignore "no em-dashes" often enough that it's enforced here too.
const tidy = (s: unknown) => String(s ?? "").replace(/\s*—\s*/g, ", ").replace(/,\s*,/g, ",");

function parseRoast(text: string): Roast {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const j = JSON.parse(cleaned);
  const roast = (Array.isArray(j.roast) ? j.roast : [j.roast]).map(tidy).filter(Boolean);
  if (!roast.join("").trim()) throw new Error("LLM returned an empty roast");
  return {
    headline: tidy(j.headline) || "Your Taste, Examined",
    diagnosis: tidy(j.diagnosis),
    roast,
    verdict: tidy(j.verdict),
  };
}

// Primary provider from LLM_PROVIDER; falls back to the other if its key is set.
export async function generateRoast(system: string, user: string): Promise<{ roast: Roast; provider: Provider; model: string }> {
  const primary: Provider = process.env.LLM_PROVIDER === "gemini" ? "gemini" : "groq";
  const order = ([primary, primary === "groq" ? "gemini" : "groq"] as Provider[]).filter((p) => process.env[KEY[p]]);
  if (!order.length) throw new Error("No LLM key configured. Set GROQ_API_KEY or GEMINI_API_KEY.");

  const errors: string[] = [];
  for (const provider of order) {
    const call = provider === "groq" ? callGroq : callGemini;
    const configured = process.env[provider === "groq" ? "GROQ_MODEL" : "GEMINI_MODEL"];
    try {
      let model = discovered[provider] ?? configured ?? (await discoverModel(provider));
      let text: string;
      try {
        text = await call(model, system, user);
      } catch (e) {
        if (!(e instanceof ModelNotFound) || discovered[provider]) throw e;
        console.warn(`[llm] ${provider} model "${model}" not found, discovering a replacement`);
        model = await discoverModel(provider);
        text = await call(model, system, user);
      }
      return { roast: parseRoast(text), provider, model };
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(errors.join(" | "));
}
