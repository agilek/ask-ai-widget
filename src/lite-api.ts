// Lite entry API: the core functions behind the `withRegistry` normalizer.
import type { Instance, Item, LiteAskAIOptions, ServiceDef } from "./types";
import { getItems as coreGetItems } from "./model";
import { activate as coreActivate } from "./open";
import { mountWith } from "./mount";
import { resolveServices as coreResolve } from "./registry";
import { withRegistry } from "./lite-normalize";

/** Buttons with precomputed hrefs. Pure and SSR-safe. */
export const getItems = (opts: LiteAskAIOptions, question = ""): Item[] => coreGetItems(withRegistry(opts), question);

/** Open a service. Returns false when nothing was opened (unknown service or empty required question). */
export const activate = (root: HTMLElement | null, key: string, opts: LiteAskAIOptions, question: string): boolean =>
  coreActivate(root, key, withRegistry(opts), question);

/** Render the buttons into `target` (element or selector). `services` must be objects, or keys added with `registerService()`. */
export const mount = (target: string | HTMLElement, opts: LiteAskAIOptions = {}): Instance | null =>
  mountWith(target, opts, withRegistry);

/** Registered keys and/or inline defs -> defs. Without a list: every registered service. */
export const resolveServices = (list?: Array<ServiceDef | string>): ServiceDef[] =>
  coreResolve(withRegistry({ services: list }).services);
