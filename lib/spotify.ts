import { cookies } from "next/headers";

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";

export const SCOPES = [
  "user-top-read",
  "user-read-recently-played",
  "user-library-read",
  "playlist-read-private",
  "user-follow-read",
].join(" ");

export const STATE_COOKIE = "sp_state";
const ACCESS_COOKIE = "sp_at";
const REFRESH_COOKIE = "sp_rt";

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export const secureCookies = () => env("SPOTIFY_REDIRECT_URI").startsWith("https://");

export function authorizeUrl(state: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: env("SPOTIFY_CLIENT_ID"),
    scope: SCOPES,
    redirect_uri: env("SPOTIFY_REDIRECT_URI"),
    state,
  });
  return `${ACCOUNTS}/authorize?${q}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const basic = Buffer.from(`${env("SPOTIFY_CLIENT_ID")}:${env("SPOTIFY_CLIENT_SECRET")}`).toString("base64");
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export const exchangeCode = (code: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: env("SPOTIFY_REDIRECT_URI") });

export async function setTokenCookies(tok: TokenResponse) {
  const jar = await cookies();
  const base = { httpOnly: true, secure: secureCookies(), sameSite: "lax" as const, path: "/" };
  jar.set(ACCESS_COOKIE, tok.access_token, { ...base, maxAge: Math.max(tok.expires_in - 60, 60) });
  if (tok.refresh_token) jar.set(REFRESH_COOKIE, tok.refresh_token, { ...base, maxAge: 60 * 60 * 24 * 30 });
}

export async function clearTokenCookies() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

// Returns a valid access token, refreshing it from the refresh cookie if needed.
export async function getAccessToken(): Promise<string | null> {
  const jar = await cookies();
  const at = jar.get(ACCESS_COOKIE)?.value;
  if (at) return at;
  const rt = jar.get(REFRESH_COOKIE)?.value;
  if (!rt) return null;
  try {
    const tok = await tokenRequest({ grant_type: "refresh_token", refresh_token: rt });
    await setTokenCookies(tok);
    return tok.access_token;
  } catch {
    return null;
  }
}

export class SpotifyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function spGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) throw new SpotifyError(res.status, `Spotify ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}
