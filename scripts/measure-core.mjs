// Size of the core (src/index.ts only, independent of element/framework wrappers) as a minified IIFE.
// Usage: node scripts/measure-core.mjs [entry]
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { cssString } from "./css-string.mjs";
const entry = new URL(`../${process.argv[2] || "src/index.ts"}`, import.meta.url).pathname;
const r = await build({ entryPoints: [entry], bundle: true, minify: true, format: "iife", target: "es2019", write: false, plugins: [cssString], logLevel: "error" });
const b = r.outputFiles[0].contents;
console.log(`${b.length} B min, ${gzipSync(b, { level: 9 }).length} B gzip`);
