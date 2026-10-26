import { cookies } from "next/headers";
import { env } from "./spotify";

// Google OAuth for the YouTube Data API (read-only). One-shot: no refresh token,
// the access token (~1h) covers the single summary fetch.

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
export const GOOGLE_STATE_COOKIE = "yt_state";
const ACCESS_COOKIE = "yt_at";

export const googleSecureCookies = () => env("GOOGLE_REDIRECT_URI").startsWith("https://");

export function googleAuthorizeUrl(state: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: env("GOOGLE_REDIRECT_URI"),
    scope: GOOGLE_SCOPE,
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "select_account",
    state,
  });
  return `${AUTH}?${q}`;
}

export async function exchangeGoogleCode(code: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      redirect_uri: env("GOOGLE_REDIRECT_URI"),
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google token request failed (${res.status}): ${await res.text()}`);
  return res.json();
}

export async function setGoogleToken(tok: { access_token: string; expires_in: number }) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, tok.access_token, {
    httpOnly: true,
    secure: googleSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(tok.expires_in - 60, 60),
  });
}

export async function getGoogleToken(): Promise<string | null> {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}

export async function clearGoogleToken() {
  (await cookies()).delete(ACCESS_COOKIE);
}

export class YouTubeError extends Error {
  constructor(public status: number, public reason: string, message: string) {
    super(message);
  }
}

export async function ytGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    let reason = "";
    try {
      reason = JSON.parse(body).error?.errors?.[0]?.reason ?? "";
    } catch {}
    throw new YouTubeError(res.status, reason, `YouTube ${path} -> ${res.status}: ${body}`);
  }
  return res.json();
}
