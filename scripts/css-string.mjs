import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { transform } from "esbuild";

/**
 * JS expression for `css`, with repeated text hoisted into shared strings (the minified bundle cannot do this for us):
 * identical declaration blocks (dark theme values), then individual long declarations that repeat (the
 * `color:var(--aai-fg,var(--_f))` of every button state), whenever that makes the output shorter.
 */
function dedupe(css) {
  if (/[`\\]|\$\{/.test(css)) return JSON.stringify(css);
  const defs = [];
  const hoist = (text, key) => {
    const seen = new Map();
    for (const m of text.matchAll(key)) seen.set(m[0], (seen.get(m[0]) || 0) + 1);
    return [...seen].filter(([t, n]) => n > 1 && n * (t.length - 5) > t.length + 16).map(([t]) => t);
  };
  let body = css;
  // 1. whole blocks that repeat
  for (const blk of hoist(body, /\{[^{}]{30,}\}/g)) {
    body = body.split(blk).join("{${v" + defs.length + "}}");
    defs.push(blk.slice(1, -1));
  }
  // 2. single declarations that repeat (not the already hoisted placeholders)
  for (const d of hoist(body.replace(/\$\{v\d+\}/g, ""), /(?<=[{;])[^{};$]{24,}(?=[;}])/g)) {
    body = body.replace(/(?<=[{;])[^{};]+(?=[;}])/g, (m) => (m === d ? "${v" + defs.length + "}" : m));
    defs.push(d);
  }
  if (!defs.length) return JSON.stringify(css);
  return `(() => { ${defs.map((d, i) => `const v${i} = ${JSON.stringify(d)};`).join(" ")} return \`${body}\`; })()`;
}

/** Minified CSS text. esbuild keeps custom-property values verbatim, so drop the whitespace it leaves there (no strings in our CSS). */
export async function minifyCss(source) {
  const { code } = await transform(source, { loader: "css", minify: true });
  return code.trim().replace(/(--[\w-]+): /g, "$1:").replace(/, /g, ",").replace(/ \}/g, "}");
}

/** `import css from "./x.css?raw"` -> the minified CSS as a string. Rules, comments and whitespace are optimized by esbuild. */
export const cssString = {
  name: "css-string",
  setup(b) {
    b.onResolve({ filter: /\.css\?raw$/ }, (a) => ({
      path: resolve(a.resolveDir, a.path),
      namespace: "css-string",
    }));
    b.onLoad({ filter: /.*/, namespace: "css-string" }, async (a) => {
      const min = await minifyCss(await readFile(a.path.replace(/\?raw$/, ""), "utf8"));
      return { contents: `export default ${dedupe(min)}`, loader: "js" };
    });
  },
};

