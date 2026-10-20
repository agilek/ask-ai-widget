import type { AskAIOptions, PromptContext, PromptPart } from "./types";

const KEYS = ["service", "question", "url", "title", "description", "selection"] as const;

const liveSelection = () => (typeof window === "undefined" ? "" : window.getSelection?.()?.toString() || "").trim();

let captured = "";

/**
 * Remember the current text selection. Clicking a button can clear the selection before the click handler runs,
 * so every renderer calls this on pointerdown and keyboard focus (see `selDown` / `selFocus`).
 * getContext() prefers a live selection, else this one.
 */
export function captureSelection(): void {
  captured = liveSelection();
}

let down = -1e9;
/** pointerdown handler of every renderer: capture before the press clears the selection. */
export const selDown = (): void => { down = Date.now(); captureSelection(); };
/** focus handler of every renderer: a mouse press clears the selection before focus fires, so only keyboard focus re-captures. */
export const selFocus = (): void => { if (Date.now() - down > 500) captureSelection(); };

/** Page values are read at call time, SSR-safe (empty strings without a DOM). `opts.page` overrides the detected values. */
export function getContext(opts: AskAIOptions, question = "", service = ""): PromptContext {
  const d = typeof document === "undefined" ? undefined : document;
  const w = typeof window === "undefined" ? undefined : window;
  const p = opts.page || {};
  return {
    service,
    question,
    url: p.url ?? (w?.location?.href || ""),
    title: (p.title ?? (d?.title || "")).trim(),
    description: p.description ?? (d?.querySelector<HTMLMetaElement>('meta[name="description"]')?.content || ""),
    selection: liveSelection() || captured,
    vars: opts.vars || {},
  };
}

/** Replace `{name}` with a context field or var; unknown -> "". */
export function render(template: string, ctx: PromptContext): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    ((KEYS as readonly string[]).includes(k) ? (ctx as any)[k] : (ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, k) ? ctx.vars[k] : "")) ?? "");
}

/** Shorten `s` by `n` characters (ellipsis included). Returns "" when that would leave nothing meaningful. */
const cut = (s: string, n: number) => {
  const keep = s.length - n - 1;
  return keep > 0 ? s.slice(0, keep).replace(/[\ud800-\udbff]$/, "").trimEnd() + "…" : "";
};

/** Hard limit that never splits a surrogate pair (encodeURIComponent throws on lone surrogates). */
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n).replace(/[\ud800-\udbff]$/, ""));

/** Resolve references to unique absolute URLs (relative ones against the page; kept as-is without a location). */
function resolveRefs(opts: AskAIOptions, ctx: PromptContext): string[] {
  const r = opts.references;
  const list = (typeof r === "function" ? r(ctx) : r) || [];
  const base = opts.page?.url || (typeof location === "undefined" ? undefined : location.href);
  const out: string[] = [];
  for (const x of list) {
    let u = String(x ?? "").trim();
    if (!u) continue;
    try { if (base) u = new URL(u, base).href; } catch { /* keep as written */ }
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

const refsPart = (urls: string[]) => (urls.length ? "Use these sources:\n" + urls.map((u) => "- " + u).join("\n") : "");

export function buildPrompt(opts: AskAIOptions, ctx: PromptContext): string {
  const part = (p: PromptPart | undefined) =>
    String((typeof p === "function" ? p(ctx) : p && render(p, ctx)) || "").trim();
  const p = [
    part(opts.instructions),
    part(opts.prompt ?? (opts.input ? "{question}" : "Explain this page.")),
    opts.context === false ? "" : part(opts.context ?? (ctx.title ? "Context: {title} — {url}" : ctx.url ? "Context: {url}" : "")),
  ];
  const refs = resolveRefs(opts, ctx);
  const tpl = opts.template ?? "{instructions}\n\n{prompt}\n\n{context}\n\n{references}";
  const join = () =>
    render(tpl, { ...ctx, vars: { ...ctx.vars, instructions: p[0], prompt: p[1], context: p[2], references: refsPart(refs) } })
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  const max = opts.maxLength ?? 4000;
  let out = join();
  // Shrink context, then references (whole lines only), then instructions; the prompt last.
  const shrink = (i: number) => {
    if (i === 3) { refs.pop(); return; }
    p[i] = cut(p[i], out.length - max);
  };
  for (const i of [2, 3, 0, 1]) {
    while (out.length > max && (i === 3 ? refs.length : p[i])) {
      shrink(i);
      out = join();
    }
  }
  return clip(out, max);
}
