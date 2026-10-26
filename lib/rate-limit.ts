// Best-effort per-IP limiter held in memory. On Vercel each warm function instance has
// its own copy, so this caps casual abuse of the free LLM quota, not a determined attacker.
const WINDOWS = [
  { ms: 60_000, max: Number(process.env.ROAST_LIMIT_PER_MINUTE) || 4, label: "minute" },
  { ms: 86_400_000, max: Number(process.env.ROAST_LIMIT_PER_DAY) || 30, label: "day" },
];

const hits = new Map<string, number[]>();

export function rateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number; label: string } {
  const now = Date.now();
  const longest = Math.max(...WINDOWS.map((w) => w.ms));
  const list = (hits.get(ip) ?? []).filter((t) => now - t < longest);

  for (const w of WINDOWS) {
    const inWindow = list.filter((t) => now - t < w.ms);
    if (inWindow.length >= w.max) {
      hits.set(ip, list);
      return { ok: false, retryAfterSec: Math.ceil((inWindow[0] + w.ms - now) / 1000), label: w.label };
    }
  }

  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < longest)) hits.delete(k);
  return { ok: true };
}
