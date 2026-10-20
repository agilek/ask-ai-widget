// Real consumer-bundle sizes. Each case is bundled + minified by esbuild against ./dist, resolved through the
// package.json "exports" and "sideEffects" exactly like an app bundler would (via a throwaway node_modules symlink).
// Consumer bundles use `splitting: true` like app bundlers do: the INITIAL chunk is what row-layout users load, the
// lazy chunk(s) (the dropdown, loaded by dynamic import only for `layout: "menu"`) are reported separately.
// Fails when the CDN file is over its budget, when tree-shaking stops working, a lite bundle ships other logos,
// or menu code leaks into an initial chunk.
//   npm run build && npm run size
import { build } from "esbuild";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const LIMIT = 30720; // CDN IIFE budget, bytes (min)
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
      external: ["react", "vue", "svelte"], platform: "browser", splitting: true, outdir: join(tmp, "out"), metafile: true,
    });
    const entryOut = Object.entries(r.metafile.outputs).find(([, o]) => o.entryPoint)[0];
    const entry = r.outputFiles.find((o) => o.path.endsWith("/" + entryOut.split("/").pop()));
    const lazy = r.outputFiles.filter((o) => o !== entry);
    const code = entry.text, lazyCode = lazy.map((o) => o.text).join("\n");
    out[name] = { code, lazyCode, min: Buffer.byteLength(code), gzip: gz(code), lazyMin: Buffer.byteLength(lazyCode), lazyGzip: lazy.length ? gz(lazyCode) : 0 };
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const cdn = readFileSync(join(root, "dist/ask-ai.min.js"));
const rows = [["(a) CDN IIFE dist/ask-ai.min.js", cdn.length, gz(cdn), 0, 0], ...Object.entries(out).map(([n, v]) => [n, v.min, v.gzip, v.lazyMin, v.lazyGzip])];
const cell = (n) => (n ? String(n) + " B" : "-").padStart(9);
console.log("bundle".padEnd(38), "initial min".padStart(12), "+gzip".padStart(9), "lazy menu min".padStart(14), "+gzip".padStart(9));
for (const [n, m, g, lm, lg] of rows) console.log(n.padEnd(38), cell(m).padStart(12), cell(g), cell(lm).padStart(14), cell(lg));

const [b, c, d, e, f] = Object.values(out);
if (cdn.length >= LIMIT) fail.push(`CDN IIFE is ${cdn.length} B, budget is < ${LIMIT} B`);
if (b.min - c.min < MIN_SAVING) fail.push(`tree-shaking: (b) ${b.min} B vs (c) ${c.min} B, expected (c) at least ${MIN_SAVING} B smaller`);
for (const k of others) if (!b.code.includes(sig(k))) fail.push(`sanity: (b) is missing the ${k} icon`);
for (const [label, v] of [["(c)", c], ["(f)", f]])
  for (const k of others) if (v.code.includes(sig(k))) fail.push(`${label} contains the ${k} icon, tree-shaking failed`);
for (const [label, v] of [["(c)", c], ["(f)", f]])
  for (const k of ["claude", "chatgpt"]) if (!v.code.includes(sig(k))) fail.push(`${label} is missing the ${k} icon`);
// Menu code and CSS must stay out of every initial chunk (the markup and the import() call are allowed there).
const MENU_ONLY = ["--aai-menu-bg", ".aai__menu .aai__btn", "ask-ai-menu-style"];
for (const [label, v] of [["(b)", b], ["(c)", c], ["(d)", d], ["(e)", e], ["(f)", f]]) {
  for (const m of MENU_ONLY) if (v.code.includes(m)) fail.push(`${label} initial chunk contains menu-only code (${m}); it must load lazily`);
  if (!v.lazyCode.includes("--aai-menu-bg") || !v.lazyCode.includes(".aai__menu .aai__btn")) fail.push(`${label} has no lazy menu chunk with the dropdown code`);
}
// The CDN build is one self-contained file: complete, with no import of another file.
const cdnText = cdn.toString("utf8");
for (const m of MENU_ONLY) if (!cdnText.includes(m)) fail.push(`CDN IIFE is missing menu code (${m})`);
if (/\bimport\s*\(/.test(cdnText)) fail.push("CDN IIFE contains a dynamic import(); it must be a single file");
if (!d.code.includes("customElements")) fail.push('(d) is empty: "sideEffects" must keep dist/element.*');
if (!e.code.includes(sig("grok"))) fail.push("(e) default React should bundle every logo");

if (fail.length) { for (const m of fail) console.error("FAIL:", m); process.exit(1); }
console.log(`ok: (b) - (c) = ${b.min - c.min} B min, ${b.gzip - c.gzip} B gzip (initial chunks)`);
