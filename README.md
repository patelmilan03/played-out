# Played Out

Spotify listening history → free-tier LLM → share card. Two modes:
- **Roast**: unhinged, disappointed-parent roast.
- **Cutie**: wholesome hype-bestie who adores everything about your taste.

Two ways in:
- **Spotify login** (OAuth). Dev Mode: app owner needs Premium, max 5 allowlisted users.
- **Data export upload** (spotify.com/account/privacy). Parsed in the browser; works for anyone.

## Setup

1. Spotify: on the **Premium** account, go to developer.spotify.com/dashboard → Create app → tick "Web API".
   Redirect URIs: `http://127.0.0.1:3000/api/auth/callback` and `https://<app>.vercel.app/api/auth/callback`.
2. Dashboard → User Management: add the email of every Spotify account that will log in (max 5).
3. Keys: Groq at console.groq.com/keys, Gemini at aistudio.google.com/apikey (one is enough; both = fallback).
4. `cp .env.example .env.local` and fill it in.
5. `npm install` then `npm run dev`, then open **http://127.0.0.1:3000** (not localhost: Spotify rejects localhost redirects and cookies are per-host).

## Deploy (Vercel free tier)

1. `npx vercel` (or push to GitHub and import in vercel.com).
2. Project → Settings → Environment Variables: copy everything from `.env.local`, with
   `SPOTIFY_REDIRECT_URI=https://<app>.vercel.app/api/auth/callback`.
3. Redeploy.

## Editing the prompts

Everything sent to the model is in `prompts/`, one folder per mode:
- `roast/system.md`, `cutie/system.md`: persona, tone, rules. Rewrite freely.
- `roast/output-format.md`, `cutie/output-format.md`: appended to that mode's system prompt. Keep the 4 JSON keys (`headline`, `diagnosis`, `roast`, `verdict`) in both modes; the page reads them. In cutie mode `diagnosis` is shown as "Certified: …" and `roast` holds the compliments.
- `user.md`: the message carrying the data, shared by both modes. Placeholders: `{{name}}`, `{{source}}`, `{{data}}` (also usable in the system files).

`<!-- comments -->` are stripped before sending. Locally, edits apply on the next roast (no restart), and the page shows the full assembled prompt under "Full prompt sent to the model". In production the prompt isn't exposed; redeploy to apply edits.

## Layout

- `lib/summarize-api.ts`: Spotify API → summary (top artists/tracks ×3 ranges, recent 50, up to 1000 liked songs, playlists, followed artists)
- `lib/summarize-export.ts`: export zip → summary (lifetime plays, skips, eras, binges, private sessions, searches, ad-targeting labels)
- `lib/prompt.ts`: assembles the prompt from `prompts/<mode>/*.md` + `prompts/user.md`
- `lib/rate-limit.ts`: per-IP roast limit (4/min, 30/day by default; shared across modes)
- `lib/llm.ts`: Groq / Gemini with fallback. Model names are optional: it lists the provider's models and picks the best chat model (Groq: gpt-oss-120b > llama-4 > llama-3.3-70b > …), and re-picks if a pinned model 404s
- `lib/card.ts`: 1080×1350 PNG share card
