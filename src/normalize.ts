import type { AskAIOptions } from "./types";
import { builtins } from "./builtins";
import { registry } from "./registry";

/**
 * Options normalizer used by the default entries (everything except `ask-ai-widget/lite*`). No side effects.
 * String keys resolve case-insensitively, registered services win over built-ins, and an omitted `services`
 * becomes every built-in (registry overrides applied) followed by any other registered service.
 */
export function withBuiltins(opts: AskAIOptions = {}): AskAIOptions {
  const all = Object.assign(Object.create(null), Object.fromEntries(builtins.map((b) => [b.key, b])), registry);
  const list = opts.services;
  return { ...opts, services: list ? list.map((s) => (typeof s === "string" ? all[s.toLowerCase()] || s : s)) : Object.values(all) };
}
