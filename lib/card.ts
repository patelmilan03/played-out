import type { Mode, Roast } from "./types";

const THEMES: Record<Mode, {
  bg: [string, string]; glow: string; accent: string; text: string; chipText: string;
  label: string; chipPrefix: string; footer: string;
}> = {
  roast: {
    bg: ["#1a0b0b", "#2b1206"], glow: "255,98,41", accent: "#ff6229", text: "#fff4ec", chipText: "#ffb08f",
    label: "PLAYED OUT  ·  UNHINGED ROAST", chipPrefix: "Diagnosis", footer: "get roasted at",
  },
  cutie: {
    bg: ["#2a0d1f", "#3b1233"], glow: "255,126,182", accent: "#ff7eb6", text: "#fff0f7", chipText: "#ffc2dd",
    label: "PLAYED OUT  ·  CERTIFIED CUTIE", chipPrefix: "Certified", footer: "get adored at",
  },
};

const W = 1080;
const H = 1350;
const PAD = 90;

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      if (lines === maxLines - 1) {
        ctx.fillText(`${line}…`, x, y);
        return y + lh;
      }
      ctx.fillText(line, x, y);
      y += lh;
      lines++;
      line = words[i];
    } else line = test;
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += lh;
  }
  return y;
}

// Renders the share card as a 1080x1350 PNG (Instagram portrait size).
export function drawCard(roast: Roast, topArtists: string[], site: string, mode: Mode, topLabel = "Top artists"): Promise<Blob> {
  const t = THEMES[mode];
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const font = (weight: number, size: number) =>
    `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, t.bg[0]);
  bg.addColorStop(1, t.bg[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, 600);
  glow.addColorStop(0, `rgba(${t.glow},0.35)`);
  glow.addColorStop(1, `rgba(${t.glow},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "top";
  ctx.fillStyle = t.accent;
  ctx.font = font(800, 30);
  ctx.fillText(t.label, PAD, PAD);

  ctx.fillStyle = t.text;
  ctx.font = font(850, 84);
  let y = wrap(ctx, roast.headline, PAD, PAD + 80, W - PAD * 2, 96, 4);

  if (roast.diagnosis) {
    y += 40;
    ctx.font = font(700, 34);
    const label = `${t.chipPrefix}: ${roast.diagnosis}`;
    const w = Math.min(ctx.measureText(label).width + 60, W - PAD * 2);
    ctx.fillStyle = `rgba(${t.glow},0.15)`;
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(PAD, y, w, 76, 38);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = t.chipText;
    wrap(ctx, label, PAD + 30, y + 20, w - 60, 40, 1);
    y += 76;
  }

  y += 60;
  ctx.fillStyle = t.text;
  ctx.font = font(500, 46);
  wrap(ctx, roast.verdict || roast.roast[0], PAD, y, W - PAD * 2, 62, 8);

  ctx.globalAlpha = 0.55;
  ctx.font = font(600, 30);
  if (topArtists.length) wrap(ctx, `${topLabel}: ${topArtists.join(" · ")}`, PAD, H - PAD - 110, W - PAD * 2, 40, 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = t.accent;
  ctx.font = font(700, 30);
  ctx.fillText(`${t.footer} ${site}`, PAD, H - PAD - 30);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"));
}
