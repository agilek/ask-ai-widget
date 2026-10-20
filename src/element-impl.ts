import type * as React from "react";
import type { AskAIOptions, InputOptions, Instance } from "./types";

// attribute -> kind: l list, c context, b boolean, n number, j JSON; anything else is a string
const KINDS: Record<string, string> = { services: "l", references: "l", page: "j", strings: "j", context: "c", "show-labels": "b", unstyled: "b", "max-length": "n", vars: "j" };
"prompt instructions template label label-position variant shape size theme layout menu-align menu-icons submit-service class-name".split(" ").forEach((k) => (KINDS[k] = "s"));
const INPUT = ["input", "placeholder", "required", "multiline"];
const camel = (s: string) => s.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

/**
 * Parse kebab-case attributes (`services`, `show-labels`, `input`, ...) of `el` into options.
 * `prefix` lets the CDN auto-mounter read `data-*` attributes with the same grammar.
 */
export function parseAttrs(el: Element, prefix = ""): AskAIOptions {
  const g = (n: string) => el.getAttribute(prefix + n);
  const o: Record<string, any> = {};
  for (const n in KINDS) {
    const v = g(n), k = KINDS[n];
    if (v === null) continue;
    try {
      o[camel(n)] = k == "l" ? v.split(",").map((s) => s.trim()).filter(Boolean)
        : k == "c" ? (/^(none|false)$/i.test(v.trim()) ? false : v)
        : k == "b" ? v != "false" : k == "n" ? +v : k == "j" ? JSON.parse(v) : v;
    } catch { /* ignore invalid JSON */ }
  }
  let [inp, ph, req, ml] = INPUT.map(g);
  const i: InputOptions = {};
  if (ph !== null) i.placeholder = ph;
  if (req !== null) i.required = req != "false";
  if (ml !== null) i.multiline = ml != "false";
  if (inp && /^[#.]/.test(inp = inp.trim())) o.input = req !== null ? { target: inp, required: i.required } : inp;
  else if (inp !== null ? inp != "false" : ph !== null || ml !== null || req !== null) o.input = Object.keys(i).length ? i : true;
  return o;
}

const Base = (typeof HTMLElement === "undefined" ? class {} : HTMLElement) as typeof HTMLElement;

/**
 * `<ask-ai>` custom element (light DOM, so page CSS applies). Configure with attributes
 * (`services="claude,chatgpt"`, `show-labels`, `input="#q"`...) or JS properties, which win over
 * attributes and may be functions (`el.prompt = (ctx) => ...`). Property changes are batched into one render.
 */
export abstract class AskAIElementCore extends Base {
  static observedAttributes = Object.keys(KINDS).concat(INPUT);
  /** @internal */ _p: Record<string, unknown> = {};
  private _k: string[] = [];
  private _i: Instance | null = null;
  private _queued = false;

  /** @internal Renders into this element; the entries decide which `mount` (default or lite). */
  abstract _mount(opts: AskAIOptions): Instance | null;

  /** The resolved options: attributes overlaid with properties. */
  get options(): AskAIOptions {
    return { ...parseAttrs(this), ...this._p } as AskAIOptions;
  }
  /** Set several properties at once (merged; `undefined` falls back to the attribute). */
  set options(v: AskAIOptions) {
    for (const k in v) this._set(k, (v as any)[k]);
    this._schedule();
  }

  /** @internal */ _set(k: string, v: unknown) {
    if (v === undefined) delete this._p[k]; else this._p[k] = v;
  }
  /** @internal */ _schedule() {
    if (!this._i || this._queued) return;
    this._queued = true;
    queueMicrotask(() => {
      this._queued = false;
      if (this._i) this._i.update(this._full());
    });
  }
  // update() merges, so list every key to reset the ones that were removed.
  private _full() {
    const o: Record<string, unknown> = {}, cur = this.options;
    for (const k of this._k) o[k] = undefined;
    this._k = Object.keys(cur);
    return Object.assign(o, cur) as AskAIOptions;
  }
  connectedCallback() {
    this._i ||= this._mount(this.options);
    this._k = Object.keys(this.options);
  }
  disconnectedCallback() {
    this._i?.destroy();
    this._i = null;
  }
  attributeChangedCallback() {
    this._schedule();
  }
}

/** Option properties on the element (`className` is the element's own, use the `class-name` attribute). */
export interface AskAIElementCore extends Omit<AskAIOptions, "className"> {}

/** Define the option properties (`el.services = [...]`) on the shared prototype. Idempotent. */
export function defineProps(): void {
  for (const k of Object.keys(KINDS).map(camel).concat("input", "onOpen"))
    if (k !== "className") Object.defineProperty(AskAIElementCore.prototype, k, {
      configurable: true,
      get(this: AskAIElementCore) { return this._p[k]; },
      set(this: AskAIElementCore, v: unknown) { this._set(k, v); this._schedule(); },
    });
}

/** Register the element class under `tag`. Idempotent and SSR-safe. */
export function defineElement(tag: string, ctor: CustomElementConstructor): void {
  if (typeof customElements !== "undefined" && !customElements.get(tag)) customElements.define(tag, ctor);
}

declare global {
  interface HTMLElementTagNameMap {
    "ask-ai": AskAIElementCore;
  }
}

/** String attributes accepted by `<ask-ai>` in JSX. Function-valued options are properties (use a ref). */
interface AskAIJsxAttrs {
  services?: string; prompt?: string; instructions?: string; context?: string; template?: string; label?: string; "label-position"?: "left" | "top" | "right" | "bottom" | "none";
  variant?: string; shape?: "circle" | "rounded" | "square"; size?: "sm" | "md" | "lg"; theme?: "light" | "dark" | "auto"; layout?: "row" | "menu"; "menu-align"?: "start" | "end"; "menu-icons"?: "stack" | "none";
  "show-labels"?: boolean | ""; unstyled?: boolean | ""; "max-length"?: number | string; "submit-service"?: string;
  "class-name"?: string; input?: boolean | string; placeholder?: string; required?: boolean | "false";
  multiline?: boolean | ""; vars?: string; references?: string; page?: string; strings?: string; class?: string;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "ask-ai": React.DetailedHTMLProps<React.HTMLAttributes<AskAIElementCore>, AskAIElementCore> & AskAIJsxAttrs;
    }
  }
}
