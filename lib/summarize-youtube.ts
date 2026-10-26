import { countBy, fmtDuration, median, pct, shareMap, spread, topN, unique } from "./stats";
import type { ListeningSummary } from "./types";

// YouTube Data API v3 -> summary of everything they engage with (not just music).
// The API has no watch history, so this works from likes, playlists and subscriptions;
// music likes (incl. YouTube Music) get their own "musicCorner" section.
// Quota: ~1 unit per call, ~16 units per user against a 10,000/day free quota.

type Get = <T>(path: string) => Promise<T>;
type Page<T> = { items?: T[]; nextPageToken?: string; pageInfo?: { totalResults?: number } };
type Video = {
  id: string;
  snippet: { title: string; channelTitle: string; publishedAt: string; categoryId?: string; tags?: string[] };
  contentDetails?: { duration?: string };
  topicDetails?: { topicCategories?: string[] };
};
type Playlist = { snippet: { title: string }; contentDetails?: { itemCount?: number } };
type Subscription = { snippet: { title: string } };

const LIKED_CAP = 500;
const SUBS_CAP = 200;
const MUSIC_CATEGORY = "10";

// YouTube's fixed video category IDs (snippet.categoryId).
const CATEGORIES: Record<string, string> = {
  "1": "Film & Animation", "2": "Autos & Vehicles", "10": "Music", "15": "Pets & Animals", "17": "Sports",
  "19": "Travel & Events", "20": "Gaming", "22": "People & Blogs", "23": "Comedy", "24": "Entertainment",
  "25": "News & Politics", "26": "Howto & Style", "27": "Education", "28": "Science & Technology", "29": "Nonprofits & Activism",
};

// Wikipedia topic URLs that just mean "music" or "not music" add no flavour.
const GENERIC_TOPICS = /^(Music|Entertainment|Lifestyle \(sociology\)|Society|Knowledge|Film|Television program|Video game culture|Hobby)$/i;

export function topicName(url: string): string {
  return decodeURIComponent(url.split("/").pop() ?? "").replace(/_/g, " ");
}

// "Artist - Topic" and "ArtistVEVO" channels are the artist; otherwise the channel name.
export function artistOf(channelTitle: string): string {
  return channelTitle.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").replace(/\s*(Official)$/i, "").trim();
}

export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([](official|lyrics?|audio|video|music video|visuali[sz]er|hd|4k|mv|live)[^)\]]*[)\]]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isoToSeconds(iso?: string): number {
  const m = iso?.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => Number(x) || 0);
  return d * 86400 + h * 3600 + min * 60 + s;
}

async function paginate<T>(get: Get, base: string, cap: number): Promise<{ items: T[]; total?: number }> {
  const items: T[] = [];
  let token: string | undefined;
  let total: number | undefined;
  do {
    const page = await get<Page<T>>(`${base}&maxResults=50${token ? `&pageToken=${token}` : ""}`);
    items.push(...(page.items ?? []));
    total ??= page.pageInfo?.totalResults;
    token = page.nextPageToken;
  } while (token && items.length < cap);
  return { items: items.slice(0, cap), total };
}

export async function buildYouTubeSummary(get: Get): Promise<ListeningSummary> {
  const channel = await get<Page<{ snippet: { title: string; publishedAt: string } }>>("/channels?part=snippet&mine=true");
  const me = channel.items?.[0]?.snippet;

  const [liked, playlists, subs] = await Promise.all([
    paginate<Video>(get, "/videos?part=snippet,contentDetails,topicDetails&myRating=like", LIKED_CAP).catch(() => null),
    paginate<Playlist>(get, "/playlists?part=snippet,contentDetails&mine=true", 50).catch(() => null),
    paginate<Subscription>(get, "/subscriptions?part=snippet&mine=true&order=relevance", SUBS_CAP).catch(() => null),
  ]);

  if (!me && !liked?.items.length && !playlists?.items.length) {
    throw new Error("This Google account has no YouTube activity to look at (no channel, likes or playlists).");
  }

  const videos = liked?.items ?? [];
  const isMusic = (v: Video) =>
    v.snippet.categoryId === MUSIC_CATEGORY ||
    /\s-\sTopic$/i.test(v.snippet.channelTitle) ||
    (v.topicDetails?.topicCategories ?? []).some((t) => /music/i.test(topicName(t)));
  const music = videos.filter(isMusic);
  const other = videos.filter((v) => !isMusic(v));
  const label = (v: Video) => `${cleanTitle(v.snippet.title)} — ${artistOf(v.snippet.channelTitle)}`;
  const artistCounts = countBy(music, (v) => artistOf(v.snippet.channelTitle));
  const secs = music.map((v) => isoToSeconds(v.contentDetails?.duration)).filter(Boolean);
  const topicsOf = (vs: Video[]) =>
    countBy(vs.flatMap((v) => (v.topicDetails?.topicCategories ?? []).map(topicName)).filter((t) => !GENERIC_TOPICS.test(t)), (g) => g);
  const genres = topicsOf(music);
  const channelCounts = countBy(videos, (v) => v.snippet.channelTitle);
  const allSecs = videos.map((v) => isoToSeconds(v.contentDetails?.duration)).filter(Boolean);

  const data: Record<string, unknown> = {
    note: "YouTube has no watch history API: this is what they liked, saved and subscribed to, not how much they watched.",
    account: me ? { channelName: me.title, onYouTubeSince: me.publishedAt.slice(0, 10) } : "no channel",
    likes: {
      totalLiked: liked?.total ?? videos.length,
      analyzed: videos.length,
      byCategory: shareMap(countBy(videos, (v) => CATEGORIES[v.snippet.categoryId ?? ""] ?? "Other"), 15),
      topChannels: topN(channelCounts, 15).map(([c, n]) => `${c} (${n} liked)`),
      topTopics: topN(topicsOf(videos), 15).map(([t]) => t),
      mostRecent: unique(videos.map((v) => `${v.snippet.title} — ${v.snippet.channelTitle}`)).slice(0, 15),
      typicalVideoLength: allSecs.length ? fmtDuration(median(allSecs) * 1000) : "n/a",
      over1Hour: videos.filter((v) => isoToSeconds(v.contentDetails?.duration) >= 3600).length,
      shorts: videos.filter((v) => { const s = isoToSeconds(v.contentDetails?.duration); return s > 0 && s <= 60; }).length,
      likedVideoUploadYears: shareMap(countBy(videos, (v) => v.snippet.publishedAt.slice(0, 4)), 10),
    },
  };

  if (music.length) {
    data.musicCorner = {
      count: music.length,
      topArtists: topN(artistCounts, 25).map(([a, n]) => `${a} (${n} liked)`),
      mostRecentLikes: unique(music.map(label)).slice(0, 15),
      randomSample: spread(unique(music.map(label)), 20),
      genres: topN(genres, 15).map(([g]) => g),
      uploadYears: shareMap(countBy(music, (v) => v.snippet.publishedAt.slice(0, 4)), 10),
      typicalLength: secs.length ? fmtDuration(median(secs) * 1000) : "n/a",
      longest: unique(
        [...music]
          .sort((a, b) => isoToSeconds(b.contentDetails?.duration) - isoToSeconds(a.contentDetails?.duration))
          .map((v) => `${label(v)} (${fmtDuration(isoToSeconds(v.contentDetails?.duration) * 1000)})`),
      ).slice(0, 3),
      officialAudioVsVideo: `${pct(music.filter((v) => /\s-\sTopic$/i.test(v.snippet.channelTitle)).length, music.length)} official audio (YT Music tracks), rest music videos`,
    };
  }

  if (other.length) {
    data.likedNonMusic = {
      count: other.length,
      topChannels: topN(countBy(other, (v) => v.snippet.channelTitle), 10).map(([c, n]) => `${c} (${n})`),
      sample: spread(unique(other.map((v) => `${v.snippet.title} — ${v.snippet.channelTitle}`)), 20),
    };
  }

  if (playlists?.items.length) {
    const sized = playlists.items.map((p) => ({ name: p.snippet.title, size: p.contentDetails?.itemCount ?? 0 }));
    data.playlists = {
      total: playlists.total ?? sized.length,
      names: sized.map((p) => p.name).slice(0, 40),
      biggest: [...sized].sort((a, b) => b.size - a.size).slice(0, 3).map((p) => `${p.name} (${p.size} items)`),
      emptyOrTiny: sized.filter((p) => p.size <= 3).map((p) => p.name).slice(0, 10),
    };
  }

  if (subs?.items.length) {
    const names = unique(subs.items.map((s) => s.snippet.title));
    data.subscriptions = {
      total: subs.total ?? names.length,
      artistChannels: names.filter((n) => /\s-\sTopic$|VEVO$/i.test(n) || artistCounts.has(artistOf(n))).slice(0, 20),
      sample: spread(names, 30),
    };
  }

  return {
    source: "youtube",
    name: me?.title ?? null,
    // For YouTube these are top channels across all likes (the card labels them so).
    topArtists: topN(channelCounts, 3).map(([c]) => c),
    data,
  };
}
