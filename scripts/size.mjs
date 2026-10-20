// Real consumer-bundle sizes. Each case is bundled + minified by esbuild against ./dist, resolved through the
// package.json "exports" and "sideEffects" exactly like an app bundler would (via a throwaway node_modules symlink).
// Fails when the CDN file is over its budget, when tree-shaking stops working, or a lite bundle ships other logos.
//   npm run build && npm run size
import { build } from "esbuild";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const LIMIT = 20480; // CDN IIFE budget, bytes (min)
const MIN_SAVING = 2000; // (b) - (c): lite + 2 services must be at least this much smaller (min bytes)
const gz = (b) => gzipSync(b, { level: 9 }).length;
const fail = [];

const tmp = mkdtempSync(join(tmpdir(), "ask-ai-size-"));
mkdirSync(join(tmp, "node_modules"));
symlinkSync(root, join(tmp, "node_modules", "ask-ai-widget"), "dir");

const cases = {
  "(b) mount from \"ask-ai-widget\"": `import { mount } from "ask-ai-widget"; mount("#a", { services: ["claude", "chatgpt"] });`,
  "(c) lite mount + claude, chatgpt": `import { mount } from "ask-ai-widget/lite"; import { claude, chatgpt } from "ask-ai-widget/services"; mount("#a", { services: [claude, chatgpt] });`,
  "(d) import \"ask-ai-widget/element\"": `import "ask-ai-widget/element";`,
  "(e) React AskAI (react external)": `import { AskAI } from "ask-ai-widget/react"; globalThis.x = AskAI;`,
  "(f) lite React + claude, chatgpt": `import { AskAI } from "ask-ai-widget/lite/react"; import { claude, chatgpt } from "ask-ai-widget/services"; globalThis.x = [AskAI, claude, chatgpt];`,
};

// A distinctive slice of every icon, to prove which logos ended up in a bundle.
const icons = readFileSync(join(root, "src/icons.ts"), "utf8");
const sig = (k) => new RegExp(`${k}Icon = "(.{30})`).exec(icons)[1];
const others = ["perplexity", "gemini", "grok", "mistral", "deepseek"];

const out = {};
try {
  for (const [name, contents] of Object.entries(cases)) {
    const r = await build({
      stdin: { contents, resolveDir: tmp, loader: "js" },
      bundle: true, minify: true, format: "esm", target: "es2019", write: false, logLevel: "error",
      external: ["react", "vue", "svelte"], platform: "browser",
    });
    const code = r.outputFiles[0].text;
    out[name] = { code, min: Buffer.byteLength(code), gzip: gz(code) };
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const cdn = readFileSync(join(root, "dist/ask-ai.min.js"));
const rows = [["(a) CDN IIFE dist/ask-ai.min.js", cdn.length, gz(cdn)], ...Object.entries(out).map(([n, v]) => [n, v.min, v.gzip])];
console.log("bundle".padEnd(40), "min".padStart(8), "min+gzip".padStart(9));
for (const [n, m, g] of rows) console.log(n.padEnd(40), String(m).padStart(6) + " B", String(g).padStart(7) + " B");

const [b, c, d, e, f] = Object.values(out);
if (cdn.length >= LIMIT) fail.push(`CDN IIFE is ${cdn.length} B, budget is < ${LIMIT} B`);
if (b.min - c.min < MIN_SAVING) fail.push(`tree-shaking: (b) ${b.min} B vs (c) ${c.min} B, expected (c) at least ${MIN_SAVING} B smaller`);
for (const k of others) if (!b.code.includes(sig(k))) fail.push(`sanity: (b) is missing the ${k} icon`);
for (const [label, v] of [["(c)", c], ["(f)", f]])
  for (const k of others) if (v.code.includes(sig(k))) fail.push(`${label} contains the ${k} icon, tree-shaking failed`);
for (const [label, v] of [["(c)", c], ["(f)", f]])
  for (const k of ["claude", "chatgpt"]) if (!v.code.includes(sig(k))) fail.push(`${label} is missing the ${k} icon`);
if (!d.code.includes("customElements")) fail.push('(d) is empty: "sideEffects" must keep dist/element.*');
if (!e.code.includes(sig("grok"))) fail.push("(e) default React should bundle every logo");

if (fail.length) { for (const m of fail) console.error("FAIL:", m); process.exit(1); }
console.log(`ok: (b) - (c) = ${b.min - c.min} B min, ${b.gzip - c.gzip} B gzip`);
