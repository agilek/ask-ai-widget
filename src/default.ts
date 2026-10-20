// Default entry API: the lite functions behind the `withBuiltins` normalizer, so string keys just work.
import type { AskAIOptions, Instance, Item, ServiceDef, ServiceKey } from "./types";
import { getItems as liteGetItems } from "./model";
import { activate as liteActivate } from "./open";
import { mountWith } from "./mount";
import { resolveServices as liteResolve } from "./registry";
import { withBuiltins } from "./normalize";

/** Buttons with precomputed hrefs. Pure and SSR-safe. */
export const getItems = (opts: AskAIOptions, question = ""): Item[] => liteGetItems(withBuiltins(opts), question);

/** Open a service. Returns false when nothing was opened (unknown service or empty required question). */
export const activate = (root: HTMLElement | null, key: string, opts: AskAIOptions, question: string): boolean =>
  liteActivate(root, key, withBuiltins(opts), question);

/** Render the buttons into `target` (element or selector). */
export const mount = (target: string | HTMLElement, opts: AskAIOptions = {}): Instance | null =>
  mountWith(target, opts, withBuiltins);

/** Keys (case-insensitive) and/or inline defs -> defs. Without a list: all built-ins plus registered services. */
export const resolveServices = (list?: Array<ServiceKey | ServiceDef>): ServiceDef[] =>
  liteResolve(withBuiltins({ services: list }).services);
