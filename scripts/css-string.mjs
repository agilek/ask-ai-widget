import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { transform } from "esbuild";

/** JS expression for `css`, with declaration blocks that occur more than once (dark theme values) hoisted into shared strings. */
function dedupe(css) {
  const seen = new Map();
  for (const [b] of css.matchAll(/\{[^{}]{30,}\}/g)) seen.set(b, (seen.get(b) || 0) + 1);
  const dup = [...seen].filter(([, n]) => n > 1).map(([b]) => b.slice(1, -1));
  if (!dup.length) return JSON.stringify(css);
  if (/[`\\]|\$\{/.test(css)) throw new Error("css-string: unsupported characters in CSS");
  let body = css;
  dup.forEach((d, i) => (body = body.split(`{${d}}`).join(`{\${v${i}}}`)));
  return `(() => { ${dup.map((d, i) => `const v${i} = ${JSON.stringify(d)};`).join(" ")} return \`${body}\`; })()`;
}

/** Minified CSS text. esbuild keeps custom-property values verbatim, so drop the whitespace it leaves there (no strings in our CSS). */
export async function minifyCss(source) {
  const { code } = await transform(source, { loader: "css", minify: true });
  return code.trim().replace(/(--[\w-]+): /g, "$1:").replace(/, /g, ",");
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

