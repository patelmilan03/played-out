import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl, secureCookies, STATE_COOKIE } from "@/lib/spotify";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
