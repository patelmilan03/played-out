export function countBy<T>(
  items: T[],
  key: (t: T) => string | null | undefined,
  weight: (t: T) => number = () => 1,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + weight(it));
  }
  return m;
}

export function topN(m: Map<string, number>, n: number): [string, number][] {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "n/a";
}

// {key: "NN%"} sorted by share, for distributions the LLM should read at a glance.
export function shareMap(m: Map<string, number>, n = 12): Record<string, string> {
  let total = 0;
  for (const v of m.values()) total += v;
  return Object.fromEntries(topN(m, n).map(([k, v]) => [k, pct(v, total)]));
}

export function decadeOf(date?: string | null): string | null {
  const y = parseInt(date?.slice(0, 4) ?? "", 10);
  return Number.isFinite(y) && y > 1900 ? `${Math.floor(y / 10) * 10}s` : null;
}

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function hours(ms: number): number {
  return Math.round(ms / 36e5);
}

export function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

// Evenly spaced picks, so long lists are sampled across their whole range.
export function spread<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  const step = xs.length / n;
  return Array.from({ length: n }, (_, i) => xs[Math.floor(i * step)]);
}

export function timeOfDay(localHours: number[]): Record<string, string> {
  const band = (h: number) =>
    h < 6 ? "late night (0-5h)" : h < 12 ? "morning (6-11h)" : h < 18 ? "afternoon (12-17h)" : "evening (18-23h)";
  return shareMap(countBy(localHours, band), 4);
}
