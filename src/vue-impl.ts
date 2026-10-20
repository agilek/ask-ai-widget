import * as Vue from "vue";
import { defineComponent, getCurrentInstance, h, onBeforeUnmount, onMounted, onUpdated, ref, watch, type PropType } from "vue";
import type { AskAIOptions, OpenDetail, PromptPart, ServiceDef, ServiceKey, Strings, Variant, Shape, Size, Theme } from "./types";
import { CHEVRON, builtinInput, firstChar, getItems, isMenu, menuLabel, rootAttrs, stackItems, str } from "./model";
import { attachMenu } from "./menu-lazy";
import { selDown, selFocus } from "./prompt";
import { resolveServices } from "./registry";
import type { Normalize } from "./mount";
import { activate, getInput, readQuestion } from "./open";
import { injectStyles } from "./styles";
import { pickOptions } from "./keys";

// `default: undefined` stops Vue from casting absent Boolean-typed props to false.
const p = <T>(type: unknown) => ({ type: type as PropType<T>, default: undefined as T | undefined });
const Field = typeof Element === "undefined" ? Object : Element;

/**
 * Build the component for an entry; `norm` maps raw props to options (`withRegistry` in lite, `withBuiltins` by default).
 *
 * Ask-AI button row. Renders real anchors with real hrefs during SSR. Emits `open` before a service
 * opens and supports `v-model:question` for the built-in input. Extra attrs (class, style, id) fall through.
 */
export const makeAskAI = (norm: Normalize) => defineComponent({
  name: "AskAI",
  props: {
    services: p<Array<ServiceKey | ServiceDef>>(Array),
    prompt: p<PromptPart>([String, Function]),
    instructions: p<PromptPart>([String, Function]),
    context: p<PromptPart | false>([Boolean, String, Function]),
    references: p<AskAIOptions["references"]>([Array, Function]),
    page: p<AskAIOptions["page"]>(Object),
    template: p<string>(String),
    vars: p<Record<string, string>>(Object),
    label: p<string>(String),
    variant: p<Variant>(String),
    shape: p<Shape>(String),
    size: p<Size>(String),
    theme: p<Theme>(String),
    layout: p<"row" | "menu">(String),
    menuAlign: p<"start" | "end">(String),
    menuIcons: p<"stack" | "none">(String),
    showLabels: p<boolean>(Boolean),
    unstyled: p<boolean>(Boolean),
    maxLength: p<number>(Number),
    input: p<NonNullable<AskAIOptions["input"]>>([Boolean, String, Object, Field]),
    strings: p<Strings>(Object),
    submitService: p<string>(String),
    className: p<string>(String),
    /** v-model:question, the text of the built-in input. */
    question: p<string>(String),
  },
  emits: {
    open: (_detail: OpenDetail) => true,
    "update:question": (_question: string) => true,
  },
  setup(props, { emit }) {
    // useId (Vue 3.5+) is SSR-stable; older Vue falls back to the instance uid.
    const uid: string = (Vue as any).useId?.() ?? "aai-v" + getCurrentInstance()!.uid;
    const root = ref<HTMLElement | null>(null);
    const own = ref("");
    const opts = (): AskAIOptions => norm({ ...pickOptions(props), onOpen: (d) => emit("open", d) });
    const ask = () => readQuestion(opts(), root.value);
    const go = (key?: string) => {
      const o = opts();
      activate(root.value, key || o.submitService || resolveServices(o.services)[0]?.key, o, ask());
    };
    const enter = (ev: Event) => {
      const e = ev as KeyboardEvent;
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); }
    };
    // Hrefs are server-computed without page context; re-sync from the live document and the live input.
    const sync = () => {
      const items = getItems(opts(), ask());
      root.value?.querySelectorAll<HTMLAnchorElement>(".aai__btn").forEach((a) => {
        const it = items.find((i) => i.key === a.getAttribute("data-service"));
        if (it && a.getAttribute("href") !== it.href) a.setAttribute("href", it.href);
      });
    };

    let ext: HTMLInputElement | HTMLTextAreaElement | null = null;
    const clear = (e: Event) => (e.target as Element).removeAttribute("aria-invalid");
    const unbind = () => {
      ext?.removeEventListener("keydown", enter);
      ext?.removeEventListener("input", clear);
      ext = null;
    };
    const bind = () => {
      unbind();
      const f = getInput(opts(), root.value);
      if (f && !root.value!.contains(f)) { ext = f; f.addEventListener("keydown", enter); f.addEventListener("input", clear); }
    };
    let menuCtl: { unbind(): void } | undefined;
    // Menu markup renders synchronously; the dropdown code and CSS load lazily, only for this layout.
    const syncMenu = () => {
      menuCtl?.unbind();
      menuCtl = isMenu(opts()) ? attachMenu(root.value!, !props.unstyled) : undefined;
    };
    onMounted(() => {
      // The dropdown's open state lives in the DOM (see menu.ts): Vue only patches props that changed, so a re-render keeps it open.
      syncMenu();
      if (!props.unstyled) injectStyles(root.value?.ownerDocument);
      sync();
      bind();
    });
    onUpdated(sync);
    watch(() => props.input, bind, { flush: "post" });
    watch(() => [props.layout, props.unstyled], syncMenu, { flush: "post" });
    onBeforeUnmount(() => { unbind(); menuCtl?.unbind(); });

    return () => {
      const o = opts();
      const { class: cls, ...data } = rootAttrs(o);
      const inp = builtinInput(o);
      const q = props.question ?? own.value;
      const field = {
        class: "aai__input", "aria-label": str(o, "question"), placeholder: inp?.placeholder, value: q,
        onInput: (e: Event) => {
          const t = e.target as HTMLInputElement;
          t.removeAttribute("aria-invalid");
          own.value = t.value;
          emit("update:question", t.value);
        },
      };
      const menu = isMenu(o), all = getItems(o, inp ? q.trim() : ""), stack = stackItems(o, all);
      const icon = (d: string) => h("svg", { class: "aai__icon", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false", fill: "currentColor", "fill-rule": "evenodd" }, [h("path", { d })]);
      return h("div", { ref: root, class: cls, ...data }, [
        o.label && !menu ? h("span", { class: "aai__label" }, o.label) : null,
        inp
          ? h("form", { class: "aai__form", onSubmit: (e: Event) => { e.preventDefault(); go(); } },
              inp.multiline ? h("textarea", { ...field, onKeydown: enter }) : h("input", field))
          : null,
        menu
          ? h("button", { type: "button", class: "aai__trigger", "aria-haspopup": "menu", "aria-expanded": "false", "aria-controls": uid }, [
              stack.length
                ? h("span", { class: "aai__stack", "aria-hidden": "true" }, stack.map((it) =>
                    h("span", { key: it.key, class: `aai__stack-item aai__btn--${it.key}`, style: it.color ? { "--aai-brand": it.color } : undefined }, [icon(it.icon!)])))
                : null,
              h("span", { class: "aai__trigger-label" }, menuLabel(o)),
              h("svg", { class: "aai__chevron", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" }, [h("path", { d: CHEVRON })]),
            ])
          : null,
        h("div", menu
          ? { class: "aai__list aai__menu", role: "menu", id: uid, "aria-label": menuLabel(o), hidden: true, "data-align": o.menuAlign === "end" ? "end" : undefined }
          : { class: "aai__list", role: "group", "aria-label": o.label || "Ask AI" },
          all.map((it) =>
            h("a", {
              key: it.key,
              class: `aai__btn aai__btn--${it.key}`,
              "data-service": it.key, href: it.href, target: "_blank", rel: "noopener noreferrer",
              ...(menu ? { role: "menuitem", tabindex: "-1" } : { "aria-label": str(o, "ask", it.label), title: str(o, "ask", it.label) }),
              "data-allow-mismatch": "attribute",
              style: it.color ? { "--aai-brand": it.color } : undefined,
              onPointerover: sync, onPointerdown: selDown, onFocusin: () => { selFocus(); sync(); },
              onClick: (e: MouseEvent) => {
                if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                go(it.key);
              },
            }, [
              it.icon ? icon(it.icon) : h("span", { class: "aai__name" }, firstChar(it.label)),
              o.showLabels || menu ? h("span", { class: "aai__name" }, it.label) : null,
            ]))),
        h("div", { class: "aai__hint", role: "status", "aria-live": "polite" }),
      ]);
    };
  },
});
