import * as React from "react";
import {
  createElement as h, forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState,
  type HTMLAttributes, type ReactElement, type ReactNode,
} from "react";
import type { AskAIOptions, LiteAskAIOptions } from "./types";
import { CHEVRON, builtinInput, firstChar, getItems, isMenu, menuLabel, rootAttrs, stackItems, str } from "./model";
import { attachMenu } from "./menu-lazy";
import { selDown, selFocus } from "./prompt";
import { resolveServices } from "./registry";
import type { Normalize } from "./mount";
import { activate, getInput, readQuestion } from "./open";
import { injectStyles } from "./styles";
import { OPTION_KEYS, pickOptions } from "./keys";

export interface AskAIProps
  extends AskAIOptions,
    Omit<HTMLAttributes<HTMLDivElement>, keyof AskAIOptions | "children" | "onChange"> {
  /** Controlled value of the built-in question field. */
  question?: string;
  /** Initial value of the built-in field when uncontrolled. */
  defaultQuestion?: string;
  /** Called with the new text whenever the built-in field changes. */
  onQuestionChange?: (question: string) => void;
}

/** Props of the lite component: `services` takes objects (strings only after `registerService()`). */
export type LiteAskAIProps = Omit<AskAIProps, "services"> & Pick<LiteAskAIOptions, "services">;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
// useId (React 18+) is SSR-stable; React 17 falls back to a counter (ids may then differ between server and client).
let seq = 0;
const useUid: () => string = (React as any).useId || (() => "aai-r" + useState(() => ++seq)[0]);
const SVG_PROPS = { className: "aai__icon", viewBox: "0 0 24 24", "aria-hidden": true, focusable: "false", fill: "currentColor", fillRule: "evenodd" } as const;

/**
 * Build the component for an entry; `norm` maps raw props to options (`withRegistry` in lite, `withBuiltins` by default).
 *
 * Ask-AI button row. Renders real anchors with real hrefs on the server; inline function props
 * (`prompt={(ctx) => ...}`) need no memoising. For zero-FOUC SSR import `ask-ai-widget/style.css`.
 */
export const makeAskAI = (norm: Normalize) => forwardRef<HTMLDivElement, AskAIProps>(function AskAI(props, ref): ReactElement {
  const { question, defaultQuestion, onQuestionChange, ...rest } = props;
  const opts = norm(pickOptions(props));
  const dom: Record<string, any> = { ...rest };
  for (const k of OPTION_KEYS) delete dom[k];

  const [own, setOwn] = useState(defaultQuestion ?? "");
  const q = question ?? own;
  const root = useRef<HTMLDivElement | null>(null);
  const latest = useRef(opts);
  useIsoLayoutEffect(() => { latest.current = opts; });

  const setRoot = useCallback((el: HTMLDivElement | null) => {
    root.current = el;
    if (typeof ref === "function") ref(el); else if (ref) (ref as { current: HTMLDivElement | null }).current = el;
  }, [ref]);

  const ask = () => readQuestion(latest.current, root.current);
  const go = (key?: string) => {
    const o = latest.current;
    activate(root.current, key || o.submitService || resolveServices(o.services)[0]?.key, o, ask());
  };
  // Hrefs are server-computed without page context; re-sync from the live document and the live input.
  const sync = () => {
    const items = getItems(latest.current, ask());
    root.current?.querySelectorAll<HTMLAnchorElement>(".aai__btn").forEach((a) => {
      const it = items.find((i) => i.key === a.getAttribute("data-service"));
      if (it && a.getAttribute("href") !== it.href) a.setAttribute("href", it.href);
    });
  };
  const enter = (e: { key: string; shiftKey: boolean; nativeEvent?: { isComposing?: boolean }; preventDefault(): void }) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent?.isComposing) { e.preventDefault(); go(); }
  };

  useEffect(() => { if (!opts.unstyled) injectStyles(root.current?.ownerDocument); }, [opts.unstyled]);
  useEffect(sync); // after every commit
  useEffect(() => {
    const ext = getInput(latest.current, root.current);
    if (!ext || root.current!.contains(ext)) return;
    const key = (e: Event) => enter(e as KeyboardEvent);
    const clear = () => ext.removeAttribute("aria-invalid");
    ext.addEventListener("keydown", key);
    ext.addEventListener("input", clear);
    return () => { ext.removeEventListener("keydown", key); ext.removeEventListener("input", clear); };
  }, [opts.input]);

  const uid = useUid();
  // The dropdown's open state lives in the DOM (see menu.ts): React re-applies only props that changed, so a re-render keeps it open.
  const menu = isMenu(opts);
  // Menu markup renders synchronously; the dropdown code and CSS load lazily, only for this layout.
  useEffect(() => (menu && root.current ? attachMenu(root.current, !opts.unstyled).unbind : undefined), [menu, opts.unstyled]);

  const attrs = rootAttrs(opts);
  const inp = builtinInput(opts);
  const all = getItems(opts, inp ? q.trim() : "");
  const children: ReactNode[] = [];
  if (opts.label && !menu) children.push(h("span", { key: "label", className: "aai__label" }, opts.label));
  if (inp) {
    const field = {
      className: "aai__input", "aria-label": str(opts, "question"), placeholder: inp.placeholder, value: q,
      onChange: (e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
        e.currentTarget.removeAttribute("aria-invalid");
        setOwn(e.currentTarget.value);
        onQuestionChange?.(e.currentTarget.value);
      },
    };
    children.push(h("form", { key: "form", className: "aai__form", onSubmit: (e: { preventDefault(): void }) => { e.preventDefault(); go(); } },
      inp.multiline ? h("textarea", { ...field, onKeyDown: enter }) : h("input", field)));
  }
  if (menu) {
    const stack = stackItems(opts, all);
    children.push(h("button", { key: "trigger", type: "button", className: "aai__trigger", "aria-haspopup": "menu", "aria-expanded": "false", "aria-controls": uid },
      stack.length
        ? h("span", { className: "aai__stack", "aria-hidden": true }, stack.map((it) => h("span", {
            key: it.key, className: `aai__stack-item aai__btn--${it.key}`, style: it.color ? ({ "--aai-brand": it.color } as any) : undefined,
          }, h("svg", SVG_PROPS, h("path", { d: it.icon })))))
        : null,
      h("span", { className: "aai__trigger-label" }, menuLabel(opts)),
      h("svg", { className: "aai__chevron", viewBox: "0 0 24 24", "aria-hidden": true, focusable: "false" }, h("path", { d: CHEVRON }))));
  }
  children.push(h("div", menu
    ? { key: "list", className: "aai__list aai__menu", role: "menu", id: uid, "aria-label": menuLabel(opts), hidden: true, "data-align": opts.menuAlign === "end" ? "end" : undefined }
    : { key: "list", className: "aai__list", role: "group", "aria-label": opts.label || "Ask AI" },
    all.map((it) => h("a", {
      key: it.key,
      className: `aai__btn aai__btn--${it.key}`,
      "data-service": it.key, href: it.href, target: "_blank", rel: "noopener noreferrer",
      ...(menu ? { role: "menuitem", tabIndex: -1 } : { "aria-label": str(opts, "ask", it.label), title: str(opts, "ask", it.label) }),
      style: it.color ? ({ "--aai-brand": it.color } as any) : undefined,
      suppressHydrationWarning: true,
      onPointerOver: sync, onPointerDown: selDown, onFocus: () => { selFocus(); sync(); },
      onClick: (e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault(): void }) => {
        if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(it.key);
      },
    },
      it.icon ? h("svg", SVG_PROPS, h("path", { d: it.icon })) : h("span", { className: "aai__name" }, firstChar(it.label)),
      opts.showLabels || menu ? h("span", { className: "aai__name" }, it.label) : null))));
  children.push(h("div", { key: "hint", className: "aai__hint", role: "status", "aria-live": "polite" }));

  const { class: cls, ...data } = attrs;
  return h("div", { ...dom, ...data, className: cls, ref: setRoot }, ...children);
});
