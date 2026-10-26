import { NextResponse } from "next/server";
import { getGoogleToken, YouTubeError, ytGet } from "@/lib/google";
import { buildYouTubeSummary } from "@/lib/summarize-youtube";

export const maxDuration = 30;

export async function GET() {
  const token = await getGoogleToken();
  if (!token) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  try {
    return NextResponse.json(await buildYouTubeSummary((p) => ytGet(token, p)));
  } catch (e) {
    if (e instanceof YouTubeError) {
      if (e.status === 401) return NextResponse.json({ error: "Google session expired, sign in again" }, { status: 401 });
      if (e.reason === "quotaExceeded" || e.reason === "dailyLimitExceeded") {
        return NextResponse.json({ error: "YouTube's free daily quota is used up. Try again tomorrow." }, { status: 429 });
      }
      if (e.reason === "accessNotConfigured") {
        return NextResponse.json({ error: "YouTube Data API v3 isn't enabled in the Google Cloud project." }, { status: 502 });
      }
      if (e.reason === "youtubeSignupRequired") {
        return NextResponse.json({ error: "This Google account has never used YouTube." }, { status: 404 });
      }
    }
    console.error("youtube summary failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "YouTube request failed" }, { status: 502 });
  }
}
