import { spGet } from "./spotify";
import { countBy, decadeOf, fmtDuration, pct, shareMap, spread, timeOfDay, topN, unique } from "./stats";
import type { ListeningSummary } from "./types";

type Artist = { name: string; genres?: string[] };
type Track = {
  name: string;
  artists: { name: string }[];
  album?: { name: string; release_date?: string };
  explicit?: boolean;
  duration_ms?: number;
};
type Paging<T> = { items: T[]; total: number };
// Feb 2026 API renamed playlist.tracks to playlist.items; accept either.
type Playlist = { name: string; owner?: { id: string }; items?: { total: number }; tracks?: { total: number } };
type SavedTrack = { added_at: string; track: Track };

const RANGES = { short_term: "last 4 weeks", medium_term: "last 6 months", long_term: "last year" } as const;
type Range = keyof typeof RANGES;
const RANGE_KEYS = Object.keys(RANGES) as Range[];

const LIKED_CAP = 1000;

const label = (t: Track) => `${t.name} — ${t.artists.map((a) => a.name).join(", ")}`;

async function fetchLiked(get: <T>(p: string) => Promise<T>) {
  const first = await get<Paging<SavedTrack>>("/me/tracks?limit=50");
  const items = [...first.items];
  const offsets: number[] = [];
  for (let o = 50; o < Math.min(first.total, LIKED_CAP); o += 50) offsets.push(o);
  // Small batches to stay clear of Spotify's rate limit.
  for (let i = 0; i < offsets.length; i += 5) {
    const pages = await Promise.all(
      offsets.slice(i, i + 5).map((o) => get<Paging<SavedTrack>>(`/me/tracks?limit=50&offset=${o}`).catch(() => null)),
    );
    for (const p of pages) if (p) items.push(...p.items);
  }
  return { total: first.total, items: items.filter((s) => s.track) };
}

export async function buildApiSummary(token: string, tzOffsetMin: number): Promise<ListeningSummary> {
  const get = <T>(p: string) => spGet<T>(token, p);

  // /me first: a 403 here means the user isn't allowlisted, and should surface as-is.
  const me = await get<{ id: string; display_name: string | null }>("/me");

  const [artistsByRange, tracksByRange, recent, liked, playlists, following] = await Promise.all([
    Promise.all(RANGE_KEYS.map((r) => get<Paging<Artist>>(`/me/top/artists?time_range=${r}&limit=50`).then((p) => p.items).catch(() => [] as Artist[]))),
    Promise.all(RANGE_KEYS.map((r) => get<Paging<Track>>(`/me/top/tracks?time_range=${r}&limit=50`).then((p) => p.items).catch(() => [] as Track[]))),
    get<{ items: { track: Track; played_at: string }[] }>("/me/player/recently-played?limit=50").then((r) => r.items).catch(() => []),
    fetchLiked(get).catch(() => null),
    get<Paging<Playlist>>("/me/playlists?limit=50").catch(() => null),
    get<{ artists: Paging<Artist> }>("/me/following?type=artist&limit=50").then((r) => r.artists).catch(() => null),
  ]);

  const byRange = <T, U>(lists: T[][], fn: (x: T) => U, n: number) =>
    Object.fromEntries(RANGE_KEYS.map((r, i) => [RANGES[r], lists[i].slice(0, n).map(fn)]));

  const allTopTracks = [...new Map(tracksByRange.flat().map((t) => [label(t), t])).values()];
  const allTopArtists = artistsByRange.flat();
  const [short, medium, long] = artistsByRange.map((list) => new Set(list.map((a) => a.name)));
  const durations = allTopTracks.map((t) => t.duration_ms ?? 0).filter(Boolean);

  const mediumTracks = tracksByRange[1].length ? tracksByRange[1] : tracksByRange[2];
  const dominance = topN(countBy(mediumTracks.flatMap((t) => t.artists.map((a) => a.name)), (n) => n), 3).map(
    ([a, n]) => `${a}: ${n} of top ${mediumTracks.length} tracks`,
  );

  const recentHours = recent.map((r) => new Date(Date.parse(r.played_at) - tzOffsetMin * 60000).getUTCHours());
  const recentCounts = countBy(recent, (r) => label(r.track));

  const data: Record<string, unknown> = {
    topArtists: byRange(artistsByRange, (a) => a.name, 25),
    topTracks: byRange(tracksByRange, label, 25),
    topGenres: topN(countBy(allTopArtists.flatMap((a) => a.genres ?? []), (g) => g), 15).map(([g]) => g),
    releaseDecadesOfTopTracks: shareMap(countBy(allTopTracks, (t) => decadeOf(t.album?.release_date))),
    explicitShareOfTopTracks: pct(allTopTracks.filter((t) => t.explicit).length, allTopTracks.length),
    avgTopTrackLength: durations.length ? fmtDuration(durations.reduce((a, b) => a + b, 0) / durations.length) : "n/a",
    artistDominance: dominance,
    loyalty: {
      last4WeeksArtistsAlsoInLastYear: pct([...short].filter((a) => long.has(a)).length, short.size),
      newObsessions: [...short].filter((a) => !medium.has(a) && !long.has(a)).slice(0, 10),
      droppedFavorites: [...long].filter((a) => !medium.has(a) && !short.has(a)).slice(0, 10),
    },
    recentlyPlayed: {
      last50: unique(recent.map((r) => label(r.track))).slice(0, 25),
      onRepeat: topN(recentCounts, 5).filter(([, n]) => n >= 3).map(([t, n]) => `${t} (${n}x in last 50 plays)`),
      uniqueArtistsInLast50: new Set(recent.flatMap((r) => r.track.artists.map((a) => a.name))).size,
      timeOfDay: timeOfDay(recentHours),
    },
  };

  if (liked) {
    const sorted = [...liked.items].sort((a, b) => a.added_at.localeCompare(b.added_at));
    data.likedSongs = {
      total: liked.total,
      analyzed: liked.items.length,
      likesPerYear: Object.fromEntries(
        [...countBy(liked.items, (s) => s.added_at.slice(0, 4)).entries()].sort(),
      ),
      oldestLikes: sorted.slice(0, 5).map((s) => `${label(s.track)} (liked ${s.added_at.slice(0, 10)})`),
      newestLikes: sorted.slice(-10).reverse().map((s) => label(s.track)),
      randomSample: spread(sorted, 15).map((s) => label(s.track)),
      topArtistsInLikes: topN(countBy(liked.items.flatMap((s) => s.track.artists.map((a) => a.name)), (n) => n), 10).map(
        ([a, n]) => `${a} (${n})`,
      ),
      releaseDecades: shareMap(countBy(liked.items, (s) => decadeOf(s.track.album?.release_date))),
      explicitShare: pct(liked.items.filter((s) => s.track.explicit).length, liked.items.length),
    };
  }

  if (playlists) {
    const sizes = playlists.items.map((p) => ({ name: p.name, size: p.items?.total ?? p.tracks?.total ?? 0 }));
    data.playlists = {
      total: playlists.total,
      ownedByUser: playlists.items.filter((p) => p.owner?.id === me.id).length,
      names: playlists.items.map((p) => p.name).slice(0, 40),
      biggest: [...sizes].sort((a, b) => b.size - a.size).slice(0, 3).map((p) => `${p.name} (${p.size} songs)`),
      emptyOrTiny: sizes.filter((p) => p.size <= 3).map((p) => p.name).slice(0, 10),
    };
  }

  if (following) {
    data.followedArtists = { total: following.total, sample: following.items.map((a) => a.name).slice(0, 25) };
  }

  return {
    source: "spotify",
    name: me.display_name,
    topArtists: (artistsByRange[1].length ? artistsByRange[1] : artistsByRange[2]).slice(0, 3).map((a) => a.name),
    data,
  };
}
