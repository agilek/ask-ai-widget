import { readFile } from "node:fs/promises";
import { defineConfig } from "vitest/config";
import { minifyCss } from "./scripts/css-string.mjs";

// Vitest turns `?raw` CSS imports into "" by default; serve the same minified text the real build embeds.
const rawCss = {
  name: "raw-css",
  enforce: "pre" as const,
  async load(id: string) {
    if (id.endsWith(".css?raw")) return `export default ${JSON.stringify(await minifyCss(await readFile(id.slice(0, -4), "utf8")))}`;
  },
};

export default defineConfig({ plugins: [rawCss], test: { environment: "happy-dom", include: ["test/**/*.test.ts"], css: { include: [/\.css\?raw$/] } } });
