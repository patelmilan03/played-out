import JSZip from "jszip";
import { countBy, hours, pct, shareMap, spread, timeOfDay, topN, unique } from "./stats";
import type { ListeningSummary } from "./types";

// Parses the zip(s) from spotify.com/account/privacy ("Account data" and/or
// "Extended streaming history") entirely in the browser.

type Play = {
  ts: number;
  ms: number;
  track: string | null;
  artist: string | null;
  show?: string | null;
  skipped?: boolean | null;
  shuffle?: boolean | null;
  incognito?: boolean | null;
  platform?: string | null;
  country?: string | null;
};

type Doc = { name: string; json: unknown };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const RELEVANT =
  /^(Streaming_History_Audio_|StreamingHistory|YourLibrary|Playlist\d*|SearchQueries|Inferences|Marquee|Identity|Userdata)/i;

const basename = (p: string) => p.split("/").pop() ?? p;

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function parseExportFiles(files: File[]): Promise<ListeningSummary> {
  const docs: Doc[] = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(f);
      for (const entry of Object.values(zip.files)) {
        const name = basename(entry.name);
        if (entry.dir || !name.toLowerCase().endsWith(".json") || !RELEVANT.test(name)) continue;
        docs.push({ name, json: safeParse(await entry.async("string")) });
      }
    } else if (lower.endsWith(".json") && RELEVANT.test(f.name)) {
      docs.push({ name: f.name, json: safeParse(await f.text()) });
    }
  }
  return summarizeDocs(docs);
}

const trackKey = (p: Play) => `${p.track} — ${p.artist}`;
const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);

export function summarizeDocs(docs: Doc[]): ListeningSummary {
  const extended: Play[] = [];
  const basic: Play[] = [];
  let library: Any = null;
  const playlists: Any[] = [];
  let searches: Any[] = [];
  let inferences: string[] = [];
  let marquee: Any[] = [];
  let name: string | null = null;

  for (const { name: file, json } of docs) {
    if (!json) continue;
    const j = json as Any;
    if (/^Streaming_History_Audio_/i.test(file) && Array.isArray(j)) {
      for (const e of j) {
        extended.push({
          ts: Date.parse(e.ts),
          ms: e.ms_played ?? 0,
          track: e.master_metadata_track_name ?? null,
          artist: e.master_metadata_album_artist_name ?? null,
          show: e.episode_show_name ?? null,
          skipped: e.skipped,
          shuffle: e.shuffle,
          incognito: e.incognito_mode,
          platform: e.platform,
          country: e.conn_country,
        });
      }
    } else if (/^StreamingHistory/i.test(file) && Array.isArray(j)) {
      for (const e of j) {
        const ts = Date.parse(String(e.endTime).replace(" ", "T") + "Z");
        if (e.podcastName) basic.push({ ts, ms: e.msPlayed ?? 0, track: null, artist: null, show: e.podcastName });
        else basic.push({ ts, ms: e.msPlayed ?? 0, track: e.trackName ?? null, artist: e.artistName ?? null });
      }
    } else if (/^YourLibrary/i.test(file)) library = j;
    else if (/^Playlist/i.test(file) && Array.isArray(j.playlists)) playlists.push(...j.playlists);
    else if (/^SearchQueries/i.test(file) && Array.isArray(j)) searches = j;
    else if (/^Inferences/i.test(file) && Array.isArray(j.inferences)) inferences = j.inferences;
    else if (/^Marquee/i.test(file) && Array.isArray(j)) marquee = j;
    else if (/^Identity/i.test(file)) name = j.displayName ?? name;
    else if (/^Userdata/i.test(file)) name = name ?? j.username ?? null;
  }

  // Extended history is a superset of the 1-year account history; never count both.
  const plays = (extended.length ? extended : basic).filter((p) => Number.isFinite(p.ts)).sort((a, b) => a.ts - b.ts);
  if (!plays.length && !library && !playlists.length) {
    throw new Error("No Spotify data found. Upload the zip(s) from spotify.com/account/privacy.");
  }

  const data: Record<string, unknown> = {};
  const music = plays.filter((p) => p.track && p.artist);
  const real = music.filter((p) => p.ms >= 30000);
  const skips = music.filter((p) => p.ms < 30000 || p.skipped);
  const artistTime = countBy(music, (p) => p.artist, (p) => p.ms);

  if (music.length) {
    const first = music[0].ts;
    const last = music[music.length - 1].ts;
    const years = unique(music.map((p) => new Date(p.ts).getFullYear()));
    const eras = Object.fromEntries(
      years.map((y) => {
        const yearPlays = music.filter((p) => new Date(p.ts).getFullYear() === y);
        return [y, topN(countBy(yearPlays, (p) => p.artist, (p) => p.ms), 3).map(([a, ms]) => `${a} (${hours(ms)}h)`)];
      }),
    );
    const lastYearTop = new Set(
      topN(countBy(music.filter((p) => new Date(p.ts).getFullYear() === years[years.length - 1]), (p) => p.artist, (p) => p.ms), 50).map(([a]) => a),
    );
    const firstYearTop = topN(countBy(music.filter((p) => new Date(p.ts).getFullYear() === years[0]), (p) => p.artist, (p) => p.ms), 5).map(([a]) => a);

    const binge = topN(countBy(real, (p) => `${dayKey(p.ts)}|${trackKey(p)}`), 1)[0];
    let streak = { key: "", n: 0 };
    for (let i = 0, run = 0; i < real.length; i++) {
      run = i > 0 && trackKey(real[i]) === trackKey(real[i - 1]) ? run + 1 : 1;
      if (run > streak.n) streak = { key: trackKey(real[i]), n: run };
    }

    data.history = {
      kind: extended.length ? "full lifetime (extended streaming history)" : "last ~12 months",
      from: dayKey(first),
      to: dayKey(last),
      totalHours: hours(music.reduce((a, p) => a + p.ms, 0)),
      totalPlays: music.length,
      uniqueArtists: artistTime.size,
      uniqueTracks: new Set(music.map(trackKey)).size,
    };
    data.topArtistsAllTime = topN(artistTime, 25).map(([a, ms]) => `${a} (${hours(ms)}h)`);
    data.topTracksAllTime = topN(countBy(real, trackKey), 25).map(([t, n]) => `${t} (${n} plays)`);
    data.topArtistsByYear = eras;
    data.exFavorites = firstYearTop.filter((a) => !lastYearTop.has(a));
    data.skipping = {
      skipRate: pct(skips.length, music.length),
      mostSkipped: topN(countBy(skips, trackKey), 10).map(([t, n]) => `${t} (skipped ${n}x)`),
    };
    data.timeOfDay = timeOfDay(music.map((p) => new Date(p.ts).getHours()));
    data.listeningByWeekday = shareMap(countBy(music, (p) => new Date(p.ts).toLocaleDateString("en", { weekday: "long" }), (p) => p.ms), 7);
    if (binge) {
      const [day, track] = binge[0].split("|");
      data.biggestSingleDayBinge = `${track}: ${binge[1]} plays on ${day}`;
    }
    if (streak.n >= 3) data.longestBackToBackRepeat = `${streak.key}: ${streak.n} times in a row`;

    if (extended.length) {
      const incog = music.filter((p) => p.incognito);
      data.privateSessionFavorites = topN(countBy(incog, trackKey), 10).map(([t, n]) => `${t} (${n})`);
      data.privateSessionShare = pct(incog.length, music.length);
      data.shuffleShare = pct(music.filter((p) => p.shuffle).length, music.length);
      data.platforms = shareMap(countBy(plays, (p) => p.platform?.split(/[ (]/)[0]), 5);
      data.countriesListenedIn = unique(plays.map((p) => p.country).filter(Boolean));
    }
  }

  const pods = plays.filter((p) => p.show);
  if (pods.length) {
    data.topPodcasts = topN(countBy(pods, (p) => p.show, (p) => p.ms), 10).map(([s, ms]) => `${s} (${hours(ms)}h)`);
  }

  if (library) {
    const liked: Any[] = Array.isArray(library.tracks) ? library.tracks : [];
    const playedSet = new Set(real.map(trackKey));
    data.library = {
      likedSongs: liked.length,
      likedSample: spread(liked, 20).map((t) => `${t.track} — ${t.artist}`),
      topArtistsInLikes: topN(countBy(liked, (t) => t.artist), 10).map(([a, n]) => `${a} (${n})`),
      likedButNeverReallyPlayed: real.length
        ? pct(liked.filter((t) => !playedSet.has(`${t.track} — ${t.artist}`)).length, liked.length)
        : "n/a",
      savedAlbums: Array.isArray(library.albums) ? library.albums.length : 0,
      followedArtists: Array.isArray(library.artists) ? library.artists.map((a: Any) => a.name).slice(0, 25) : [],
      followedShows: Array.isArray(library.shows) ? library.shows.map((s: Any) => s.name).slice(0, 10) : [],
      bannedTracks: Array.isArray(library.bannedTracks) ? library.bannedTracks.map((t: Any) => `${t.track} — ${t.artist}`).slice(0, 10) : [],
    };
  }

  if (playlists.length) {
    const sized = playlists.map((p) => ({ name: String(p.name), size: Array.isArray(p.items) ? p.items.length : 0 }));
    data.playlists = {
      total: playlists.length,
      names: sized.map((p) => p.name).slice(0, 40),
      biggest: [...sized].sort((a, b) => b.size - a.size).slice(0, 3).map((p) => `${p.name} (${p.size} songs)`),
      emptyOrTiny: sized.filter((p) => p.size <= 3).map((p) => p.name).slice(0, 10),
    };
  }

  if (searches.length) {
    const sorted = [...searches].sort((a, b) => String(b.searchTime).localeCompare(String(a.searchTime)));
    data.recentSearches = unique(sorted.map((s) => String(s.searchQuery ?? "").trim()).filter(Boolean)).slice(0, 40);
  }

  if (inferences.length) {
    const clean = unique(inferences.map((s) => String(s).replace(/^\d?P_?/i, "").replace(/_/g, " ").trim()).filter(Boolean));
    data.spotifyAdTargetingLabels = spread(clean, 40);
  }

  if (marquee.length) {
    const bySegment: Record<string, string[]> = {};
    for (const m of marquee) (bySegment[m.segment] ??= []).push(m.artistName);
    data.spotifyFanSegments = Object.fromEntries(Object.entries(bySegment).map(([s, a]) => [s, a.slice(0, 8)]));
  }

  return {
    source: "export",
    name,
    topArtists: topN(artistTime, 3).map(([a]) => a),
    data,
  };
}
