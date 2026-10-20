import type { AskAIOptions } from "./types";
import { mount } from "./default";
import { runAction, type Action } from "./svelte-impl";

export type * from "./types";
export type { Action };

/**
 * `<div use:askAI={{ services: ["claude"], label: "Ask AI" }}></div>`. Works in Svelte 3, 4 and 5.
 * Updates re-render with the new options; options removed from the object revert to their defaults.
 */
export const askAI: Action<HTMLElement, AskAIOptions> = (node, opts) => runAction(mount, node, opts);
