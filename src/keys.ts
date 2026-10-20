import type { AskAIOptions } from "./types";

/** Every option key, used by the wrappers to split options from passthrough props. */
export const OPTION_KEYS = [
  "services", "prompt", "instructions", "context", "references", "page", "template", "vars", "label", "variant", "shape", "size",
  "theme", "layout", "menuAlign", "menuIcons", "showLabels", "unstyled", "maxLength", "input", "strings", "submitService", "className", "onOpen",
] as const satisfies ReadonlyArray<keyof AskAIOptions>;

/** Copy the defined option keys of `props`. */
export function pickOptions(props: Record<string, any>): AskAIOptions {
  const o: Record<string, unknown> = {};
  for (const k of OPTION_KEYS) if (props[k] !== undefined) o[k] = props[k];
  return o as AskAIOptions;
}
