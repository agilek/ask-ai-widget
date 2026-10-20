import type { AskAIOptions, OpenDetail } from "./types";
import { resolveServices } from "./registry";
import { buildPrompt, getContext } from "./prompt";
import { buildUrl } from "./url";
import { inputOptions, str } from "./model";

type Field = HTMLInputElement | HTMLTextAreaElement;

/** The input holding the question: the built-in one inside root, or the external element/selector. */
export function getInput(opts: AskAIOptions, root?: ParentNode | null): Field | null {
  const i = opts.input;
  if (!i) return null;
  const c = inputOptions(i);
  const t = (c ? c.target : i) as string | Field | undefined; // selector, element, or undefined for the built-in field
  if (typeof t === "string") return typeof document === "undefined" ? null : document.querySelector<Field>(t);
  if (t && typeof t === "object") return t;
  return root?.querySelector<Field>(".aai__input") || null;
}

export function readQuestion(opts: AskAIOptions, root?: ParentNode | null): string {
  return (getInput(opts, root)?.value || "").trim();
}

const timers = new WeakMap<Element, number>();

/** Open a service. Synchronous up to window.open so popup blockers stay quiet. Returns false when nothing was opened (unknown service or empty required question). */
export function activate(root: HTMLElement | null, key: string, opts: AskAIOptions, question: string): boolean {
  const service = resolveServices(opts.services).find((s) => s.key === key);
  if (!service) return false;
  question = question.trim();
  if (opts.input && inputOptions(opts.input)?.required !== false && !question) {
    const f = getInput(opts, root);
    f?.setAttribute("aria-invalid", "true");
    f?.focus();
    return false;
  }
  const prompt = buildPrompt(opts, getContext(opts, question, key));
  const url = buildUrl(service, prompt);
  const detail: OpenDetail = { service: key, prompt, url };
  opts.onOpen?.(detail);
  root?.dispatchEvent(new CustomEvent("ask-ai:open", { bubbles: true, detail }));
  const clip = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (service.prefill === false && clip) {
    try { clip.writeText(prompt).catch(() => {}); } catch { /* ignore */ }
    const hint = root?.querySelector<HTMLElement>(".aai__hint");
    if (hint) {
      // The live region stays in the DOM and only its text changes, which screen readers announce reliably.
      hint.textContent = str(opts, "copied", service.label);
      clearTimeout(timers.get(hint));
      timers.set(hint, window.setTimeout(() => { hint.textContent = ""; }, 4000));
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
