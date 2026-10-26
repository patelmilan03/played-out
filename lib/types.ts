// Each mode has its own prompt folder: prompts/<mode>/.
export type Mode = "roast" | "cutie";
export const MODES: Mode[] = ["roast", "cutie"];

// Compact, LLM-ready digest of someone's listening. Built in the server from the
// Spotify API, or in the browser from a privacy-data export zip.
export type ListeningSummary = {
  source: "spotify" | "export";
  name: string | null;
  topArtists: string[];
  data: Record<string, unknown>;
};

export type Roast = {
  headline: string;
  diagnosis: string;
  roast: string[];
  verdict: string;
};
