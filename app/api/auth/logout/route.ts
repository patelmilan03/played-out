import { NextResponse } from "next/server";
import { clearGoogleToken } from "@/lib/google";
import { clearTokenCookies } from "@/lib/spotify";

export async function POST() {
  await clearTokenCookies();
  await clearGoogleToken();
  return NextResponse.json({ ok: true });
}
