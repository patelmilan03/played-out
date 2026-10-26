import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the root to this folder; a stray lockfile higher up (e.g. C:\Milan) makes Next guess wrong.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // Prompt files are read with fs at runtime; make sure Vercel ships them with the roast function.
  outputFileTracingIncludes: {
    "/api/roast": ["./prompts/**/*"],
  },
};

export default nextConfig;
