import { NextRequest, NextResponse } from "next/server";
import { generateRoast } from "@/lib/llm";
import { buildPrompt } from "@/lib/prompt";
import { rateLimit } from "@/lib/rate-limit";
import { MODES, type ListeningSummary, type Mode } from "@/lib/types";

export const maxDuration = 30;

const MAX_DATA_CHARS = 60_000;

export async function POST(req: NextRequest) {
  let body: { summary?: ListeningSummary; mode?: Mode };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { summary, mode = "roast" } = body;
  if (!summary || typeof summary.data !== "object" || !MODES.includes(mode)) {
    return NextResponse.json({ error: "Expected { summary, mode?: 'roast' | 'cutie' }" }, { status: 400 });
  }
  if (JSON.stringify(summary.data).length > MAX_DATA_CHARS) {
    return NextResponse.json({ error: "Summary too large" }, { status: 413 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const limit = rateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Roast limit reached for this ${limit.label}. Try again in ${Math.ceil(limit.retryAfterSec / 60)} min.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let prompt: { system: string; user: string };
  try {
    prompt = buildPrompt(summary, mode);
  } catch (e) {
    console.error("prompt files unreadable", e);
    return NextResponse.json({ error: "Prompt files missing from /prompts" }, { status: 500 });
  }

  try {
    const result = await generateRoast(prompt.system, prompt.user);
    // In dev, echo the exact prompt so the page can show it while you edit /prompts.
    return NextResponse.json(process.env.NODE_ENV === "production" ? result : { ...result, prompt });
  } catch (e) {
    console.error("roast failed", e);
    const msg = e instanceof Error && e.message.startsWith("No LLM key") ? e.message : "The roast machine broke. Try again in a minute.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
