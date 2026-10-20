import type { AskAIOptions, Instance, LiteAskAIOptions } from "../types";
import { AskAIElementCore, defineElement, defineProps, parseAttrs } from "../element-impl";
import { mount } from "../lite-api";

export { parseAttrs };
export type { AskAIElementCore }; // the base class carries the option properties and typings

/** `<ask-ai>` without built-in services: set `el.services = [claude, chatgpt]` (objects from "ask-ai-widget/services"). */
export class AskAIElement extends AskAIElementCore {
  /** Objects from "ask-ai-widget/services"; a string works only if registered with `registerService()`. */
  declare services?: LiteAskAIOptions["services"];
  /** @internal */ _mount(opts: AskAIOptions): Instance | null {
    return mount(this, opts);
  }
}

/** Register the element. Idempotent and SSR-safe. */
export const defineAskAI = (tag = "ask-ai"): void => defineElement(tag, AskAIElement);

defineProps();
defineAskAI();
