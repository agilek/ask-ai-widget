import type { AskAIOptions, ServiceDef } from "./types";
import { registry } from "./registry";

const BUILTIN = /^(chatgpt|claude|perplexity|gemini|grok|mistral|deepseek)$/i;
let warnedEmpty = false;

/**
 * Options normalizer of the lite entries: string keys resolve only through `registerService`, so the built-ins
 * are never bundled unless you import them. Unknown keys are dropped with a hint; an omitted `services` means
 * every registered service (and warns once when there is none).
 */
export function withRegistry(opts: AskAIOptions = {}): AskAIOptions {
  const list = opts.services;
  if (!list) {
    const all = Object.keys(registry).map((k) => registry[k]);
    if (!all.length && !warnedEmpty) {
      warnedEmpty = true;
      console.warn('[ask-ai] No services. With ask-ai-widget/lite pass objects: import { claude } from "ask-ai-widget/services"');
    }
    return { ...opts, services: all };
  }
  const out: ServiceDef[] = [];
  for (const s of list) {
    const d = typeof s === "string" ? registry[s.toLowerCase()] : s;
    if (d) out.push(d);
    else console.warn(
      `[ask-ai] Unknown service "${s}". ` +
      (BUILTIN.test(s as string)
        ? `With ask-ai-widget/lite pass the object: import { ${(s as string).toLowerCase()} } from "ask-ai-widget/services"`
        : "Pass a service object or call registerService()."),
    );
  }
  return { ...opts, services: out };
}
