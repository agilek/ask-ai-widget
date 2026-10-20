// Loaded on demand (menu-lazy.ts) and only for `layout: "menu"`: this module holds the dropdown's behaviour and its CSS,
// so row-only users never download them. Importing it has no side effects; styles are injected when asked.
//
// Behaviour of the dropdown (`layout: "menu"`), shared by every renderer so they act identically.
// State lives in the DOM (`aria-expanded` on the trigger, `hidden` on the menu), never in a framework: React and Vue
// only re-apply props that changed between renders, so a re-render while open leaves the menu open.
// Listeners are delegated on the root and look elements up on use, so re-rendered markup keeps working.

import menuCss from "./menu.css?raw";

const GAP = 4;

/** The dropdown stylesheet text (minified at build time). */
export const css: string = menuCss;

/** Inject the menu stylesheet once, right AFTER the core one (`#ask-ai-style`) so the cascade order core -> menu is stable. */
export function injectMenuStyles(doc: Document): void {
  if (doc.getElementById("ask-ai-menu-style")) return;
  const s = doc.createElement("style");
  s.id = "ask-ai-menu-style";
  s.textContent = menuCss;
  const core = doc.getElementById("ask-ai-style");
  core ? core.after(s) : (doc.head || doc.documentElement).prepend(s);
}

/** Flip above the trigger when the menu does not fit below and there is more room above. Pure DOM, no library. */
export function placeMenu(root: HTMLElement, trigger: HTMLElement, menu: HTMLElement): void {
  const s = menu.style, tr = trigger.getBoundingClientRect(), h = menu.getBoundingClientRect().height;
  const below = (root.ownerDocument.defaultView || window).innerHeight - tr.bottom, top = below < h + GAP && tr.top > below;
  // Offsets are relative to the root, so the menu follows the trigger when an input shares the row.
  s.setProperty("--_mt", trigger.offsetTop + trigger.offsetHeight + GAP + "px");
  s.setProperty("--_mb", root.clientHeight - trigger.offsetTop + GAP + "px");
  s.setProperty("--_ml", trigger.offsetLeft + "px");
  s.setProperty("--_mr", root.clientWidth - trigger.offsetLeft - trigger.offsetWidth + "px");
  top ? menu.setAttribute("data-placement", "top") : menu.removeAttribute("data-placement");
}

/** Wire the menu of `root`. Returns `open`, `close` and `unbind` (removes every listener, also the document one). */
export function bindMenu(root: HTMLElement): { open(at?: number): void; close(focus?: boolean): void; unbind(): void } {
  const doc = root.ownerDocument;
  const t = () => root.querySelector<HTMLElement>(".aai__trigger");
  const m = () => root.querySelector<HTMLElement>(".aai__menu");
  const items = () => Array.from(m()?.querySelectorAll<HTMLElement>(".aai__btn") || []);
  const isOpen = () => t()?.getAttribute("aria-expanded") === "true";
  // Bound only while the menu is open.
  const out = (e: Event) => { if (!root.contains(e.target as Node)) close(); };

  function close(focus?: boolean) {
    doc.removeEventListener("pointerdown", out, true);
    const tr = t(), me = m();
    if (!tr || !me) return;
    tr.setAttribute("aria-expanded", "false");
    me.setAttribute("hidden", "");
    if (focus) tr.focus();
  }
  /** `at`: item to focus (-1 = last); undefined keeps focus on the trigger (mouse). */
  function open(at?: number) {
    const tr = t(), me = m();
    if (!tr || !me) return;
    me.removeAttribute("hidden");
    tr.setAttribute("aria-expanded", "true");
    placeMenu(root, tr, me);
    doc.addEventListener("pointerdown", out, true);
    const l = items();
    if (at !== undefined) l[at < 0 ? l.length - 1 : at]?.focus();
  }

  // Capture phase: runs before the renderers' own click handlers, so a failed activation can still focus the input.
  const onClick = (e: Event) => {
    const el = e.target as Element;
    if (el.closest?.(".aai__trigger")) isOpen() ? close() : open();
    else if (el.closest?.(".aai__menu .aai__btn")) close(!!m()?.contains(doc.activeElement));
  };
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as Element, k = e.key, inTrigger = el.closest?.(".aai__trigger"), inMenu = el.closest?.(".aai__menu");
    if ((!inTrigger && !inMenu) || e.ctrlKey || e.metaKey || e.altKey) return;
    const list = items(), n = list.length;
    if (inTrigger) {
      if (k === "ArrowDown" || k === "Enter" || k === " ") { e.preventDefault(); open(0); }
      else if (k === "ArrowUp") { e.preventDefault(); open(-1); }
      else if (k === "Escape") close();
      return;
    }
    const cur = list.indexOf(el.closest(".aai__btn") as HTMLElement);
    const go = (i: number) => { e.preventDefault(); list[(i + n) % n]?.focus(); };
    if (k === "Escape") { e.preventDefault(); close(true); }
    else if (k === "Tab") close(); // no trap: focus moves on naturally
    else if (k === " ") { e.preventDefault(); list[cur]?.click(); }
    else if (k === "ArrowDown") go(cur + 1);
    else if (k === "ArrowUp") go(cur - 1);
    else if (k === "Home") go(0);
    else if (k === "End") go(-1);
    else if (k.length === 1) {
      // type-ahead: next item (after the current one, wrapping) whose name starts with the typed character
      const c = k.toLowerCase();
      list.slice(cur + 1).concat(list.slice(0, cur + 1)).find((a) => a.textContent!.trim().toLowerCase().startsWith(c))?.focus();
    }
  };
  // Some browsers click a button on Space keyup even after keydown was handled.
  const onUp = (e: KeyboardEvent) => { if (e.key === " " && (e.target as Element).closest?.(".aai__trigger")) e.preventDefault(); };

  root.addEventListener("click", onClick, true);
  root.addEventListener("keydown", onKey as EventListener);
  root.addEventListener("keyup", onUp as EventListener);
  return {
    open,
    close,
    unbind() {
      close();
      root.removeEventListener("click", onClick, true);
      root.removeEventListener("keydown", onKey as EventListener);
      root.removeEventListener("keyup", onUp as EventListener);
    },
  };
}
