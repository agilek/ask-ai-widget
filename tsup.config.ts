import { defineConfig } from "tsup";
import { cssString } from "./scripts/css-string.mjs";

const entry = {
  index: "src/index.ts",
  element: "src/element.ts",
  react: "src/react.ts",
  vue: "src/vue.ts",
  svelte: "src/svelte.ts",
  // Same APIs without built-in services, plus the individually exported services.
  "lite/index": "src/lite/index.ts",
  "lite/element": "src/lite/element.ts",
  "lite/react": "src/lite/react.ts",
  "lite/vue": "src/lite/vue.ts",
  "lite/svelte": "src/lite/svelte.ts",
  services: "src/builtins.ts",
};

export default defineConfig([
  {
    entry,
    format: ["esm", "cjs"],
    clean: true,
    target: "es2019",
    external: ["react", "vue", "svelte"],
    esbuildPlugins: [cssString],
  },
  {
    // Types only. The css import is a virtual module handled by the plugin above, so rollup must not resolve it.
    entry,
    format: ["esm", "cjs"],
    dts: { only: true },
    external: ["react", "vue", "svelte", /\.css\?raw$/],
  },
  {
    entry: { "ask-ai.min": "src/cdn.ts" },
    format: ["iife"],
    globalName: "AskAI",
    minify: true,
    target: "es2019",
    outExtension: () => ({ js: ".js" }),
    esbuildPlugins: [cssString],
  },
]);
