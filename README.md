# Played Out

Spotify listening history → free-tier LLM → share card. Two modes:
- **Roast**: unhinged, disappointed-parent roast.
- **Cutie**: wholesome hype-bestie who adores everything about your taste.

Three ways in:
- **Google login** for YouTube / YouTube Music (YouTube Data API, read-only): liked songs and videos, playlists, subscriptions. No play history (the API doesn't expose it). Up to 100 test users while the Google app is unverified; unlimited after verification.
- **Spotify login** (OAuth). Dev Mode: app owner needs Premium, max 5 allowlisted users.
- **Data export upload** (spotify.com/account/privacy). Parsed in the browser; works for anyone.

## Setup

1. Spotify: on the **Premium** account, go to developer.spotify.com/dashboard → Create app → tick "Web API".
   Redirect URIs: `http://127.0.0.1:3000/api/auth/callback` and `https://<app>.vercel.app/api/auth/callback`.
2. Dashboard → User Management: add the email of every Spotify account that will log in (max 5).
3. Keys: Groq at console.groq.com/keys, Gemini at aistudio.google.com/apikey (one is enough; both = fallback).
4. `cp .env.example .env.local` and fill it in.
5. `npm install` then `npm run dev`, then open **http://127.0.0.1:3000** (not localhost: Spotify rejects localhost redirects and cookies are per-host).

## Google / YouTube setup

1. console.cloud.google.com → create a project (e.g. "played-out").
2. APIs & Services → Library → **YouTube Data API v3** → Enable.
3. Google Auth Platform (OAuth consent screen) → External → app name, support email, developer email.
   - Data access / Scopes: add `https://www.googleapis.com/auth/youtube.readonly`.
   - Audience: leave in **Testing**, add each friend's Google email under Test users (max 100).
4. Clients → Create client → **Web application**. Authorized redirect URIs:
   `https://played-out.vercel.app/api/auth/google/callback` and `http://127.0.0.1:3000/api/auth/google/callback`.
5. Put the client ID/secret in `.env.local` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`) and in Vercel's env vars (production redirect URI).

Testing mode: users see a "Google hasn't verified this app" screen (Advanced → Continue). To open it to anyone with no warning, submit the app for verification: needs a privacy policy page, a homepage and a domain you own (a custom domain; `*.vercel.app` can't be verified). Free; review takes days to weeks.

Quota: ~16 units per login against 10,000/day free, so roughly 600 logins/day.

## Deploy (Vercel free tier)

Live at https://played-out.vercel.app. The Vercel project is connected to this GitHub repo:
- Push to `main` → production deploy.
- Push to any other branch → preview deploy with its own URL (Spotify login won't work there: its redirect URI only allows the production domain).

Env vars live in Vercel → Project → Settings → Environment Variables (same names as `.env.example`, with
`SPOTIFY_REDIRECT_URI=https://played-out.vercel.app/api/auth/callback`). Changing them needs a redeploy.

## Editing the prompts

Everything sent to the model is in `prompts/`, one folder per mode, one persona file per data source:
- `roast/music.md`, `cutie/music.md`: used for Spotify login and the Spotify export. Music critic persona.
- `roast/youtube.md`, `cutie/youtube.md`: used for Google/YouTube login. General-content persona (channels, categories, videos), no music specifics. `roast/youtube.md` copies the Tone line and em-dash rule from `roast/music.md`; keep them in sync by hand.
- `roast/output-format.md`, `cutie/output-format.md`: appended after the persona file, for both sources. Keep the 4 JSON keys (`headline`, `diagnosis`, `roast`, `verdict`) in both modes; the page reads them. In cutie mode `diagnosis` is shown as "Certified: …" and `roast` holds the compliments.
- `user.md`: the message carrying the data, shared by both modes. Placeholders: `{{name}}`, `{{source}}`, `{{data}}` (also usable in the system files).

`<!-- comments -->` are stripped before sending. Locally, edits apply on the next roast (no restart), and the page shows the full assembled prompt under "Full prompt sent to the model". In production the prompt isn't exposed; redeploy to apply edits.

## Layout

- `lib/summarize-api.ts`: Spotify API → summary (top artists/tracks ×3 ranges, recent 50, up to 1000 liked songs, playlists, followed artists)
- `lib/google.ts`, `lib/summarize-youtube.ts`: Google OAuth + YouTube Data API → summary (up to 500 likes split into music/non-music, artists from "- Topic"/VEVO channels, genres from topic categories, playlists, subscriptions)
- `lib/summarize-export.ts`: export zip → summary (lifetime plays, skips, eras, binges, private sessions, searches, ad-targeting labels)
- `lib/prompt.ts`: assembles the prompt from `prompts/<mode>/<music|youtube>.md` + `output-format.md` + `prompts/user.md`
- `lib/rate-limit.ts`: per-IP roast limit (4/min, 30/day by default; shared across modes)
- `lib/llm.ts`: Groq / Gemini with fallback. Model names are optional: it lists the provider's models and picks the best chat model (Groq: gpt-oss-120b > llama-4 > llama-3.3-70b > …), and re-picks if a pinned model 404s
- `lib/card.ts`: 1080×1350 PNG share card
