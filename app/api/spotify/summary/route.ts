import { NextRequest, NextResponse } from "next/server";
import { getAccessToken, SpotifyError } from "@/lib/spotify";
import { buildApiSummary } from "@/lib/summarize-api";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const tz = Number(req.nextUrl.searchParams.get("tz") ?? 0) || 0;
  try {
    return NextResponse.json(await buildApiSummary(token, tz));
  } catch (e) {
    if (e instanceof SpotifyError && e.status === 403) {
      return NextResponse.json(
        {
          error:
            "Spotify refused this account. Dev Mode apps only allow up to 5 listed users: add this account's email under User Management in the Spotify Developer Dashboard.",
        },
        { status: 403 },
      );
    }
    if (e instanceof SpotifyError && e.status === 401) {
      return NextResponse.json({ error: "Spotify session expired, log in again" }, { status: 401 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Spotify request failed" }, { status: 502 });
  }
}
