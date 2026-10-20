import type { LiteAskAIOptions } from "../types";
import { mount } from "../lite-api";
import { runAction, type Action } from "../svelte-impl";

export type * from "../types";
export type { Action };

/** `<div use:askAI={{ services: [claude, chatgpt] }}></div>` with objects from "ask-ai-widget/services" (strings resolve only after `registerService()`). */
export const askAI: Action<HTMLElement, LiteAskAIOptions> = (node, opts) => runAction(mount, node, opts);
