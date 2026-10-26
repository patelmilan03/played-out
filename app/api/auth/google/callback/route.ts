import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, GOOGLE_STATE_COOKIE, setGoogleToken } from "@/lib/google";
import { env } from "@/lib/spotify";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  // Same reasoning as the Spotify callback: cookies live on the registered host.
  const home = new URL("/", env("GOOGLE_REDIRECT_URI"));
  const jar = await cookies();
  const expected = jar.get(GOOGLE_STATE_COOKIE)?.value;
  jar.delete(GOOGLE_STATE_COOKIE);

  const fail = (msg: string) => {
    home.searchParams.set("error", msg);
    return NextResponse.redirect(home);
  };

  const err = url.searchParams.get("error");
  if (err) return fail(err === "access_denied" ? "Google sign-in was cancelled" : `Google sign-in failed (${err})`);
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return fail("Login state mismatch, try again");

  try {
    await setGoogleToken(await exchangeGoogleCode(code));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Token exchange failed");
  }
  return NextResponse.redirect(home);
}
