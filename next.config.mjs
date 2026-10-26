/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prompt files are read with fs at runtime; make sure Vercel ships them with the roast function.
  outputFileTracingIncludes: {
    "/api/roast": ["./prompts/**/*"],
  },
};

export default nextConfig;
