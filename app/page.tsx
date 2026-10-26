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
    fetch(`/api/spotify/summary?tz=${new Date().getTimezoneOffset()}`)
      .then(async (res) => {
        const body = await res.json();
        if (res.ok) setSummary(body);
        else if (res.status !== 401) setError(body.error);
      })
      .catch(() => setError("Couldn't reach the server"))
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
    const blob = await drawCard(result.roast, summary.topArtists, window.location.host, result.mode);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = COPY[result.mode].file;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onReset() {
    if (summary?.source === "spotify") await fetch("/api/auth/logout", { method: "POST" });
    setSummary(null);
    setResult(null);
  }

  const shown = result && result.mode === mode ? result : null;

  return (
    <main>
      <div className="eyebrow">Played Out</div>
      <h1>{mode === "roast" ? "Your music taste, roasted." : "Your music taste, adored."}</h1>
      <p className="lede">
        Connect Spotify or drop in your data export. An AI reads your listening history and either tears it apart or
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
            <h2>Log in with Spotify</h2>
            <p>Top artists and tracks, recent plays, liked songs, playlists. Beta: only allowlisted accounts work for now.</p>
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
            {summary.source === "spotify" ? "Pulled from your Spotify account." : "Pulled from your data export."}
            {summary.topArtists.length > 0 && ` Top artists: ${summary.topArtists.join(", ")}.`}
          </p>
          <div className="row">
            <button onClick={onGenerate} disabled={!!loading}>
              {shown ? copy.again : copy.button}
            </button>
            <button className="btn-ghost" onClick={onReset} disabled={!!loading}>
              {summary.source === "spotify" ? "Log out" : "Start over"}
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
