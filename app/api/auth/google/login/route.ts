import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { GOOGLE_STATE_COOKIE, googleAuthorizeUrl, googleSecureCookies } from "@/lib/google";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(googleAuthorizeUrl(state));
  res.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: googleSecureCookies(),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
