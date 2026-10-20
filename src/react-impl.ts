import {
  createElement as h, forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState,
  type HTMLAttributes, type ReactElement, type ReactNode,
} from "react";
import type { AskAIOptions, LiteAskAIOptions } from "./types";
import { builtinInput, firstChar, getItems, rootAttrs, str } from "./model";
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

  const attrs = rootAttrs(opts);
  const inp = builtinInput(opts);
  const children: ReactNode[] = [];
  if (opts.label) children.push(h("span", { key: "label", className: "aai__label" }, opts.label));
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
      inp.multiline ? h("textarea", { ...field, onKeyDown: enter }) : h("input", { ...field, type: "text" })));
  }
  children.push(h("div", { key: "list", className: "aai__list", role: "group", "aria-label": opts.label || "Ask AI" },
    getItems(opts, inp ? q.trim() : "").map((it) => h("a", {
      key: it.key,
      className: `aai__btn aai__btn--${it.key}`,
      "data-service": it.key, href: it.href, target: "_blank", rel: "noopener noreferrer",
      "aria-label": str(opts, "ask", it.label), title: str(opts, "ask", it.label),
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
      opts.showLabels ? h("span", { className: "aai__name" }, it.label) : null))));
  children.push(h("div", { key: "hint", className: "aai__hint", role: "status", "aria-live": "polite" }));

  const { class: cls, ...data } = attrs;
  return h("div", { ...dom, ...data, className: cls, ref: setRoot }, ...children);
});
