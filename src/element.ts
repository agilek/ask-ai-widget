import type { AskAIOptions, Instance } from "./types";
import { AskAIElementCore, defineElement, defineProps, parseAttrs } from "./element-impl";
import { mount } from "./default";

export { parseAttrs };
export type { AskAIElementCore }; // the base class carries the option properties and typings

/**
 * `<ask-ai>` custom element (light DOM, so page CSS applies). Configure with attributes
 * (`services="claude,chatgpt"`, `show-labels`, `input="#q"`...) or JS properties, which win over
 * attributes and may be functions (`el.prompt = (ctx) => ...`). Property changes are batched into one render.
 */
export class AskAIElement extends AskAIElementCore {
  /** @internal */ _mount(opts: AskAIOptions): Instance | null {
    return mount(this, opts);
  }
}

/** Register the element. Idempotent and SSR-safe. */
export const defineAskAI = (tag = "ask-ai"): void => defineElement(tag, AskAIElement);

defineProps();
defineAskAI();
