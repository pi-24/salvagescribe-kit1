/** @type {import('next').NextConfig} */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  // The prototype relies on per-request server state (in-memory ledger store),
  // so Next's cache-components mode is disabled and routes stay dynamic.
  cacheComponents: false,
  outputFileTracingIncludes: { "/*": ["./data/**/*", "./lib/engine/prompts/**/*", "./public/marketglass/index.html"] },
  turbopack: {
    // Pin the workspace root: the repo has multiple lockfiles (parent kit dir).
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
