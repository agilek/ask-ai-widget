import type { AskAIOptions, Instance } from "./types";
import { CHEVRON, builtinInput, firstChar, getItems, isMenu, menuLabel, rootAttrs, stackItems, str } from "./model";
import { bindMenu } from "./menu";
import { resolveServices } from "./registry";
import { activate, getInput, readQuestion } from "./open";
import { injectStyles } from "./styles";
import { selDown, selFocus } from "./prompt";

const SVG_TAGS = /^(svg|path)$/;

/** Create an element (HTML or SVG) with attributes and optional text. */
function el(tag: string, attrs: Record<string, string> = {}, text?: string): HTMLElement {
  const e = SVG_TAGS.test(tag) ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e as HTMLElement;
}

const instances = new WeakMap<HTMLElement, Instance>();
let seq = 0;
const svg = (d: string, attrs: Record<string, string>) => {
  const s = el("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false", ...attrs });
  s.append(el("path", { d }));
  return s;
};
const icon = (d: string) => svg(d, { class: "aai__icon", fill: "currentColor", "fill-rule": "evenodd" });

/** Maps raw options to the ones the renderer uses (`withRegistry` in lite, `withBuiltins` in the default entries). */
export type Normalize = (opts: AskAIOptions) => AskAIOptions;

/** Shared implementation of every `mount`; the entries pass their normalizer. */
export function mountWith(target: string | HTMLElement, opts: AskAIOptions, norm: Normalize): Instance | null {
  const root = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
  if (!root) return null;
  instances.get(root)?.destroy(); // never stack listeners / state on one element
  let o = norm(opts);
  const origClasses = new Set(Array.from(root.classList));
  let added: string[] = [];
  const origAttrs: Record<string, string | null> = {};
  const uid = "aai-m" + ++seq;
  let ext: HTMLInputElement | HTMLTextAreaElement | null = null;

  const q = () => readQuestion(o, root);
  const go = (key?: string) => activate(root, key || o.submitService || resolveServices(o.services)[0]?.key, o, q());
  const clearInvalid = (e: Event) => (e.target as Element).removeAttribute("aria-invalid");
  const extKey = (e: Event) => {
    const k = e as KeyboardEvent;
    if (k.key === "Enter" && !k.shiftKey && !k.isComposing) { e.preventDefault(); go(); }
  };
  const target$ = (e: Event) => (e.target as Element).closest?.(".aai__btn") as HTMLAnchorElement | null;

  function render() {
    const attrs = rootAttrs(o);
    root!.classList.remove(...added);
    added = attrs.class.split(/\s+/).filter((c) => c && !origClasses.has(c));
    root!.classList.add(...added);
    for (const k in attrs) if (k !== "class") {
      if (!(k in origAttrs)) origAttrs[k] = root!.getAttribute(k);
      root!.setAttribute(k, attrs[k]);
    }
    const prevQ = q();
    menuCtl.close();
    root!.textContent = "";
    const menu = isMenu(o);
    if (o.label && !menu) root!.append(el("span", { class: "aai__label" }, o.label));
    const inp = builtinInput(o);
    if (inp) {
      const i = el(inp.multiline ? "textarea" : "input", { class: "aai__input", "aria-label": str(o, "question") }) as HTMLInputElement;
      if (!inp.multiline) i.type = "text";
      if (inp.placeholder) i.placeholder = inp.placeholder;
      i.value = prevQ;
      const f = el("form", { class: "aai__form" });
      f.append(i);
      root!.append(f);
    }
    const all = getItems(o, q());
    if (menu) {
      const label = menuLabel(o), trig = el("button", { type: "button", class: "aai__trigger", "aria-haspopup": "menu", "aria-expanded": "false", "aria-controls": uid });
      const stack = stackItems(o, all);
      if (stack.length) {
        const st = el("span", { class: "aai__stack", "aria-hidden": "true" });
        for (const it of stack) {
          const i = el("span", { class: `aai__stack-item aai__btn--${it.key}` });
          if (it.color) i.style.setProperty("--aai-brand", it.color);
          i.append(icon(it.icon!));
          st.append(i);
        }
        trig.append(st);
      }
      trig.append(el("span", { class: "aai__trigger-label" }, label), svg(CHEVRON, { class: "aai__chevron" }));
      root!.append(trig);
    }
    const list = el("div", menu
      ? { class: "aai__list aai__menu", role: "menu", id: uid, "aria-label": menuLabel(o), hidden: "", ...(o.menuAlign === "end" ? { "data-align": "end" } : {}) }
      : { class: "aai__list", role: "group", "aria-label": o.label || "Ask AI" });
    for (const it of all) {
      const ask = str(o, "ask", it.label);
      const a = el("a", {
        class: `aai__btn aai__btn--${it.key}`, "data-service": it.key, href: it.href, target: "_blank", rel: "noopener noreferrer",
        ...(menu ? { role: "menuitem", tabindex: "-1" } : { "aria-label": ask, title: ask }),
      });
      if (it.color) a.style.setProperty("--aai-brand", it.color);
      if (it.icon) a.append(icon(it.icon));
      else a.append(el("span", { class: "aai__name" }, firstChar(it.label)));
      if (o.showLabels || menu) a.append(el("span", { class: "aai__name" }, it.label));
      list.append(a);
    }
    root!.append(list, el("div", { class: "aai__hint", role: "status", "aria-live": "polite" }));
    ext = getInput(o, root);
    if (ext && !root!.contains(ext)) {
      ext.addEventListener("keydown", extKey);
      ext.addEventListener("input", clearInvalid);
    } else ext = null;
    if (!o.unstyled) injectStyles(root!.ownerDocument);
  }

  const unbindExt = () => {
    ext?.removeEventListener("keydown", extKey);
    ext?.removeEventListener("input", clearInvalid);
    ext = null;
  };

  const onClick = (e: Event) => {
    const a = target$(e), m = e as MouseEvent;
    if (!a || !root.contains(a) || m.button || m.metaKey || m.ctrlKey || m.shiftKey || m.altKey) return;
    e.preventDefault();
    go(a.getAttribute("data-service")!);
  };
  const refresh = (e: Event) => {
    const a = target$(e);
    const it = a && getItems(o, q()).find((i) => i.key === a.getAttribute("data-service"));
    if (a && it && a.getAttribute("href") !== it.href) a.setAttribute("href", it.href);
  };
  const onFocus = (e: Event) => { selFocus(); refresh(e); };
  const onSubmit = (e: Event) => { e.preventDefault(); go(); };
  const onKey = (e: Event) => {
    if ((e.target as Element).tagName === "TEXTAREA" && (e.target as Element).classList.contains("aai__input")) extKey(e);
  };
  const on: Array<[string, (e: any) => void]> = [
    ["click", onClick], ["pointerover", refresh], ["focusin", onFocus], ["pointerdown", selDown],
    ["submit", onSubmit], ["input", clearInvalid], ["keydown", onKey],
  ];
  on.forEach(([t, f]) => root.addEventListener(t, f));
  const menuCtl = bindMenu(root);
  render();

  let dead = false;
  const inst: Instance = {
    element: root,
    update(p) {
      if (dead) return;
      unbindExt();
      o = norm({ ...o, ...p });
      render();
    },
    destroy() {
      if (dead) return;
      dead = true;
      if (instances.get(root) === inst) instances.delete(root);
      on.forEach(([t, f]) => root.removeEventListener(t, f));
      menuCtl.unbind();
      unbindExt();
      root.textContent = "";
      root.classList.remove(...added);
      for (const k in origAttrs) origAttrs[k] === null ? root.removeAttribute(k) : root.setAttribute(k, origAttrs[k]!);
    },
  };
  instances.set(root, inst);
  return inst;
}
