import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { env, exchangeCode, setTokenCookies, STATE_COOKIE } from "@/lib/spotify";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  // Redirect to the registered origin, not the request's: Next can report "localhost"
  // for 127.0.0.1, and the cookies only exist on the registered host.
  const home = new URL("/", env("SPOTIFY_REDIRECT_URI"));
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  const fail = (msg: string) => {
    home.searchParams.set("error", msg);
    return NextResponse.redirect(home);
  };

  if (url.searchParams.get("error")) return fail(`Spotify login cancelled (${url.searchParams.get("error")})`);
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return fail("Login state mismatch, try again");

  try {
    await setTokenCookies(await exchangeCode(code));
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Token exchange failed");
  }
  return NextResponse.redirect(home);
}
