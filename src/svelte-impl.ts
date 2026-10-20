import type { AskAIOptions, Instance } from "./types";

export type { AskAIOptions };

/** Svelte action signature, defined locally so `svelte` is not needed at type-check time. */
export type Action<N extends HTMLElement, P> = (node: N, params?: P) => { update?(params: P): void; destroy?(): void } | void;

/** Shared action body; `mount` is the entry's (default or lite) mount. Works in Svelte 3, 4 and 5. */
export function runAction(
  mount: (node: HTMLElement, opts: AskAIOptions) => Instance | null,
  node: HTMLElement,
  opts: AskAIOptions = {},
): { update(next?: AskAIOptions): void; destroy(): void } {
  let inst: Instance | null = mount(node, opts);
  let keys = Object.keys(opts);
  return {
    update(next = {}) {
      const reset: Record<string, undefined> = {};
      for (const k of keys) reset[k] = undefined;
      keys = Object.keys(next);
      inst?.update({ ...reset, ...next });
    },
    destroy() {
      inst?.destroy();
      inst = null;
    },
  };
}
