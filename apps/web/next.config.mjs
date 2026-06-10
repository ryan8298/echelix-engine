import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Root the build trace at the monorepo root so pnpm-hoisted deps resolve.
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  // Workspace packages whose TS sources Next.js should transpile.
  transpilePackages: ["@echelix/core", "@echelix/db", "@echelix/connectors", "@echelix/brief"],
};

export default nextConfig;
