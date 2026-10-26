"use client";

import { useEffect, useState } from "react";
import { drawCard } from "@/lib/card";
import { parseExportFiles } from "@/lib/summarize-export";
import type { ListeningSummary, Mode, Roast } from "@/lib/types";

type Prompt = { system: string; user: string };

const COPY: Record<Mode, { tab: string; ready: string; button: string; again: string; loading: string; chip: string; file: string }> = {
  roast: {
    tab: "Roast me",
    ready: "Ready to roast",
    button: "Roast me",
    again: "Roast me again",
    loading: "Sharpening knives…",
    chip: "Diagnosis",
    file: "played-out-roast.png",
  },
  cutie: {
    tab: "Be nice to me",
    ready: "Ready to adore",
    button: "Shower me in love",
    again: "More love please",
    loading: "Collecting sparkles…",
    chip: "Certified",
    file: "played-out-cutie.png",
  },
};

export default function Home() {
  const [summary, setSummary] = useState<ListeningSummary | null>(null);
  const [loading, setLoading] = useState<string | null>("Checking Spotify login…");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("roast");
  const [result, setResult] = useState<{ roast: Roast; mode: Mode } | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const copy = COPY[mode];

  useEffect(() => {
    document.body.dataset.mode = mode;
  }, [mode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setError(err);
      window.history.replaceState(null, "", "/");
    }
    // Whichever login cookie exists wins; 401 just means "not logged in with that one".
    const load = async (url: string) => {
      const res = await fetch(url);
      const body = await res.json();
      if (res.ok) return body as ListeningSummary;
      if (res.status !== 401) throw new Error(body.error);
      return null;
    };
    Promise.allSettled([load("/api/youtube/summary"), load(`/api/spotify/summary?tz=${new Date().getTimezoneOffset()}`)])
      .then((results) => {
        const found = results.find((r) => r.status === "fulfilled" && r.value);
        if (found?.status === "fulfilled" && found.value) return setSummary(found.value);
        const failed = results.find((r) => r.status === "rejected");
        if (failed?.status === "rejected") setError(failed.reason instanceof Error ? failed.reason.message : "Couldn't reach the server");
      })
      .finally(() => setLoading(null));
  }, []);

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setResult(null);
    setLoading("Reading your export (this stays in your browser)…");
    try {
      setSummary(await parseExportFiles([...files]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file");
    } finally {
      setLoading(null);
    }
  }

  async function onGenerate() {
    if (!summary) return;
    setError(null);
    setLoading(copy.loading);
    try {
      const res = await fetch("/api/roast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary, mode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setResult({ roast: body.roast, mode });
      setPrompt(body.prompt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  async function onDownload() {
    if (!result || !summary) return;
    const blob = await drawCard(result.roast, summary.topArtists, window.location.host, result.mode, topLabel);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = COPY[result.mode].file;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onReset() {
    if (summary?.source !== "export") await fetch("/api/auth/logout", { method: "POST" });
    setSummary(null);
    setResult(null);
  }

  const shown = result && result.mode === mode ? result : null;
  const isYouTube = summary?.source === "youtube";
  const topLabel = isYouTube ? "Top channels" : "Top artists";

  return (
    <main>
      <div className="eyebrow">Played Out</div>
      <h1>{`Your ${isYouTube ? "YouTube" : "music"} taste, ${mode === "roast" ? "roasted" : "adored"}.`}</h1>
      <p className="lede">
        Sign in with Google (YouTube Music) or Spotify, or drop in your data export. An AI reads your listening history and either tears it apart or
        gushes over it. You pick.
      </p>

      <div className="modes" role="tablist">
        {(Object.keys(COPY) as Mode[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={m === mode}
            className={m === mode ? "mode on" : "mode"}
            onClick={() => setMode(m)}
            disabled={!!loading}
          >
            {COPY[m].tab}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {!summary && (
        <>
          <section className="panel">
            <h2>Sign in with Google</h2>
            <p>For YouTube: the videos you liked, your playlists and subscriptions. Read-only, nothing is saved.</p>
            <a className="btn btn-google" href="/api/auth/google/login">
              Sign in with Google
            </a>
          </section>
          <section className="panel">
            <h2>Log in with Spotify</h2>
            <p>Top artists and tracks, recent plays, liked songs, playlists. Invite only: Spotify limits this to 5 people.</p>
            <a className="btn btn-spotify" href="/api/auth/login">
              Connect Spotify
            </a>
          </section>
          <section className="panel">
            <h2>Or upload your Spotify data export</h2>
            <p>
              Request it at spotify.com/account/privacy (Account data and/or Extended streaming history). Upload the .zip files
              here. They are parsed in your browser; only a short summary is sent to the AI.
            </p>
            <label className="file">
              <input type="file" accept=".zip,.json" multiple onChange={(e) => onUpload(e.target.files)} />
              Choose .zip or .json files
            </label>
          </section>
        </>
      )}

      {summary && (
        <section className="panel">
          <h2>{summary.name ? `${copy.ready} ${summary.name}` : `${copy.ready} you`}</h2>
          <p>
            {{ spotify: "Pulled from your Spotify account.", youtube: "Pulled from your YouTube account.", export: "Pulled from your data export." }[summary.source]}
            {summary.topArtists.length > 0 && ` ${topLabel}: ${summary.topArtists.join(", ")}.`}
          </p>
          <div className="row">
            <button onClick={onGenerate} disabled={!!loading}>
              {shown ? copy.again : copy.button}
            </button>
            <button className="btn-ghost" onClick={onReset} disabled={!!loading}>
              {summary.source === "export" ? "Start over" : "Log out"}
            </button>
          </div>
        </section>
      )}

      {loading && (
        <p className="row muted">
          <span className="spinner" /> {loading}
        </p>
      )}

      {shown && !loading && (
        <section className="panel roast">
          <h2>{shown.roast.headline}</h2>
          {shown.roast.diagnosis && (
            <div className="diagnosis">
              {COPY[shown.mode].chip}: {shown.roast.diagnosis}
            </div>
          )}
          {shown.roast.roast.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {shown.roast.verdict && <p className="verdict">{shown.roast.verdict}</p>}
          <div className="row">
            <button onClick={onDownload}>Download share card</button>
          </div>
        </section>
      )}

      {summary && (
        <details>
          <summary>Exactly what gets sent to the AI</summary>
          <pre>{JSON.stringify(summary.data, null, 2)}</pre>
        </details>
      )}

      {prompt && (
        <details>
          <summary>Full prompt sent to the model (dev only, from /prompts)</summary>
          <pre>{`--- SYSTEM ---\n${prompt.system}\n\n--- USER ---\n${prompt.user}`}</pre>
        </details>
      )}
    </main>
  );
}
