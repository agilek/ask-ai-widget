// Source: ./style.css, minified at build time by the tsup plugin (see tsup.config.ts).
import raw from "./style.css?raw";

/** The default stylesheet text. */
export const css: string = raw;

export function injectStyles(doc: Document | undefined = typeof document === "undefined" ? undefined : document): void {
  if (!doc || doc.getElementById("ask-ai-style")) return;
  const s = doc.createElement("style");
  s.id = "ask-ai-style";
  s.textContent = css;
  (doc.head || doc.documentElement).prepend(s);
}
