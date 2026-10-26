import { readFileSync } from "node:fs";
import path from "node:path";
import type { ListeningSummary, Mode } from "./types";

// Prompt text lives in /prompts so it can be edited without touching code.
// Read on every request: edits apply on the next roast in dev, and after a redeploy in prod.
const DIR = path.join(process.cwd(), "prompts");

function read(file: string): string {
  return readFileSync(path.join(DIR, file), "utf8")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => vars[k] ?? m);
}

export function buildPrompt(summary: ListeningSummary, mode: Mode) {
  const vars = {
    source:
      summary.source === "spotify"
        ? "Spotify Web API (recent top lists, liked songs, playlists)"
        : "Spotify privacy data export",
    name: summary.name ?? "unknown",
    data: JSON.stringify(summary.data),
  };
  return {
    system: fill(`${read(`${mode}/system.md`)}\n\n${read(`${mode}/output-format.md`)}`, vars),
    user: fill(read("user.md"), vars),
  };
}
