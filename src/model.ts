import type { AskAIOptions, InputOptions, Item, Strings } from "./types";
import { resolveServices } from "./registry";
import { buildPrompt, getContext } from "./prompt";
import { buildUrl } from "./url";

/** Buttons with precomputed hrefs. Pure and SSR-safe. */
export function getItems(opts: AskAIOptions, question = ""): Item[] {
  return resolveServices(opts.services).map((s) => ({
    key: s.key,
    label: s.label,
    href: buildUrl(s, buildPrompt(opts, getContext(opts, question, s.key))),
    icon: s.icon,
    color: s.color,
    prefill: s.prefill !== false,
  }));
}

/** First whole character of a label (emoji-safe), the fallback glyph for services without an icon. */
export const firstChar = (label: string): string => Array.from(label)[0] || "";

/** The options object of `input` (`{}` for `true`); null for off, a selector or an element. */
export function inputOptions(i: AskAIOptions["input"]): InputOptions | null {
  return i === true ? {} : i && typeof i === "object" && !("tagName" in i) ? (i as InputOptions) : null;
}

/** Options of the built-in field, or null when there is none (off, or bound to an external element/selector). */
export function builtinInput(opts: AskAIOptions): InputOptions | null {
  const c = inputOptions(opts.input);
  return c && !c.target ? c : null;
}

const STRINGS: Required<Strings> = { ask: "Ask {service}", question: "Your question", copied: "Prompt copied — paste it into {service}" };

/** A text the widget writes itself, translated through `opts.strings`. */
export const str = (opts: AskAIOptions, key: keyof Strings, service = ""): string =>
  (opts.strings?.[key] ?? STRINGS[key]).replace(/\{service\}/g, () => service);

/** Class + data-* attributes every renderer puts on the root element. */
export function rootAttrs(opts: AskAIOptions): Record<string, string> {
  return {
    class: ("aai " + (opts.className || "")).trim(),
    "data-variant": opts.variant || "soft",
    "data-shape": opts.shape || "circle",
    "data-size": opts.size || "md",
    "data-theme": opts.theme || "light",
  };
}
