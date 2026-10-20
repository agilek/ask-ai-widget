// Loads the dropdown (src/menu.ts: behaviour + CSS) on demand, so only `layout: "menu"` pays for it.
// Every renderer calls `attachMenu` after rendering the (synchronous) menu markup. Rows never import the module.

type Mod = typeof import("./menu");

let loading: Promise<Mod> | undefined;

/** Start, or reuse, the one module-wide import of the dropdown code. A failed load is not cached, so the next mount retries. */
export const loadMenu = (): Promise<Mod> => (loading ||= import("./menu").catch((e) => { loading = undefined; throw e; }));

/** True once something asked for the dropdown code (a test hook: row layouts must never do). */
export const menuRequested = (): boolean => !!loading;

/**
 * Wire the dropdown of `root`. The import starts right away (not on first click). Until it resolves, the trigger is
 * handled by a tiny stand-in that remembers the first click / opening key, and replays it once the real controller is
 * bound, so an early click is never lost. `unbind()` before the import resolves binds nothing afterwards.
 */
export function attachMenu(root: HTMLElement, styled = true): { unbind(): void } {
  let dead = false, real: ReturnType<Mod["bindMenu"]> | undefined, pend: { at?: number } | null = null;
  const onTrigger = (e: Event) => !!(e.target as Element).closest?.(".aai__trigger");
  const standIn: Array<[string, (e: Event) => void, boolean?]> = [
    // a second early click toggles the pending open off, like it would on the real trigger
    ["click", (e) => { if (onTrigger(e)) pend = pend ? null : {}; }, true],
    ["keydown", (e) => {
      const k = e as KeyboardEvent, at = k.key === "ArrowUp" ? -1 : /^(ArrowDown|Enter| )$/.test(k.key) ? 0 : undefined;
      if (at !== undefined && onTrigger(e) && !k.ctrlKey && !k.metaKey && !k.altKey) { e.preventDefault(); pend = { at }; }
    }],
    ["keyup", (e) => { if ((e as KeyboardEvent).key === " " && onTrigger(e)) e.preventDefault(); }],
  ];
  const off = () => standIn.forEach(([t, f, c]) => root.removeEventListener(t, f, c));
  standIn.forEach(([t, f, c]) => root.addEventListener(t, f, c));
  loadMenu().then((m) => {
    if (dead) return;
    off();
    real = m.bindMenu(root);
    if (styled) m.injectMenuStyles(root.ownerDocument);
    if (pend) real.open(pend.at);
  }, () => { /* offline / chunk missing: the menu markup stays closed; the next mount retries */ });
  return { unbind() { dead = true; pend = null; off(); real?.unbind(); } };
}
