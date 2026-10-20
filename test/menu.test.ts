// Dropdown menu layout: markup parity across renderers, keyboard / pointer behaviour, activation, placement.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement as h, act } from "react";
import { renderToString } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { createApp, createSSRApp, h as vh, nextTick, ref } from "vue";
import { renderToString as vueRender } from "@vue/server-renderer";
import { mount } from "../src";
import { AskAI as ReactAskAI } from "../src/react";
import { AskAI as VueAskAI } from "../src/vue";
import { AskAI as LiteReact } from "../src/lite/react";
import { claude, chatgpt } from "../src/builtins";
import { placeMenu } from "../src/menu";
import { loadMenu } from "../src/menu-lazy";
import { parseAttrs } from "../src/element";
import "../src/element";
import * as lite from "../src/lite";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement, open: ReturnType<typeof vi.fn>;
beforeEach(() => {
  document.body.innerHTML = '<div id="h"></div><button id="other">x</button>';
  document.title = "Doc";
  host = document.getElementById("h")!;
  open = vi.fn();
  window.open = open as any;
});
afterEach(() => vi.unstubAllGlobals());

/** Resolves once the lazily loaded dropdown code is bound (the renderers subscribe to the same promise earlier, so they run first). */
const ready = async () => { await loadMenu(); await Promise.resolve(); };

const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = host) => r.querySelector<T>(s)!;
const trigger = () => $("button.aai__trigger");
const menu = () => $(".aai__menu");
const items = () => Array.from(host.querySelectorAll<HTMLAnchorElement>(".aai__menu .aai__btn"));
const isOpen = () => trigger().getAttribute("aria-expanded") === "true" && !menu().hasAttribute("hidden");
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(e);
  return e;
};
const click = (el: Element, init: MouseEventInit = {}) => {
  const e = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  el.dispatchEvent(e);
  return e;
};
const pointerdown = (el: Element) => el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
const active = () => document.activeElement;

/** Structural serialisation (sorted attributes, ids and framework-only attributes removed) to compare renderers. */
function shape(html: string | Element): string {
  const box = typeof html === "string" ? Object.assign(document.createElement("div"), { innerHTML: html }) : html;
  const walk = (n: Element): string => {
    const attrs = Array.from(n.attributes)
      .filter((a) => !["id", "aria-controls", "data-allow-mismatch"].includes(a.name) && !(a.name === "style" && !a.value) && !(a.name === "value" && !a.value))
      .map((a) => `${a.name}=${a.name === "style" ? a.value.replace(/[\s;]/g, "") : a.value}`)
      .sort();
    return `<${n.tagName.toLowerCase()} ${attrs.join(" ")}>${n.childNodes.length ? Array.from(n.childNodes).map((c) => (c.nodeType === 1 ? walk(c as Element) : c.textContent)).join("") : ""}</>`;
  };
  return Array.from(box.children).map(walk).join("");
}

const base = { services: ["claude", "gemini", "grok", "mistral"], layout: "menu" as const, context: false as const };

describe("markup", () => {
  it("renders the contract", () => {
    mount("#h", { ...base, services: ["claude", "gemini"] });
    expect(host.dataset.layout).toBe("menu");
    expect(host.querySelector(".aai__label")).toBeNull();
    expect(host.querySelector(".aai__list[role=group]")).toBeNull();
    const t = trigger();
    expect(t.getAttribute("type")).toBe("button");
    expect(t.getAttribute("aria-haspopup")).toBe("menu");
    expect(t.getAttribute("aria-expanded")).toBe("false");
    expect(t.getAttribute("aria-controls")).toBe(menu().id);
    expect(menu().id).toBeTruthy();
    expect(t.querySelector(".aai__trigger-label")!.textContent).toBe("Ask AI");
    expect(t.querySelector(".aai__stack")!.getAttribute("aria-hidden")).toBe("true");
    expect(t.querySelectorAll(".aai__stack-item.aai__btn--claude svg.aai__icon")).toHaveLength(1);
    expect(t.querySelector(".aai__stack-item")!.getAttribute("style")).toContain("--aai-brand");
    expect(t.querySelector("svg.aai__chevron")!.getAttribute("aria-hidden")).toBe("true");
    expect(menu().getAttribute("role")).toBe("menu");
    expect(menu().getAttribute("aria-label")).toBe("Ask AI");
    expect(menu().hasAttribute("hidden")).toBe(true);
    expect(menu().classList.contains("aai__list")).toBe(true);
    const it = items()[0];
    expect(it.getAttribute("role")).toBe("menuitem");
    expect(it.getAttribute("tabindex")).toBe("-1");
    expect(it.classList.contains("aai__btn--claude")).toBe(true);
    expect(it.querySelector(".aai__name")!.textContent).toBe("Claude");
    expect(host.querySelector(".aai__hint")).toBeTruthy();
    expect(host.querySelector(".aai__menu")!.nextElementSibling!.className).toBe("aai__hint");
  });
  it("row layout is unchanged except for data-layout", () => {
    mount("#h", { services: ["claude"] });
    expect(host.dataset.layout).toBe("row");
    expect(host.querySelector(".aai__trigger, .aai__menu")).toBeNull();
    expect(host.querySelector(".aai__list")!.getAttribute("role")).toBe("group");
  });
  it("shows at most three logos and skips services without an icon", () => {
    const noIcon = { key: "kagi", label: "Kagi", url: "https://kagi.test/", param: "q" };
    mount("#h", { ...base, services: [noIcon, "claude", "gemini", "grok", "mistral"] });
    expect(Array.from(host.querySelectorAll(".aai__stack-item")).map((e) => e.className)).toEqual([
      "aai__stack-item aai__btn--claude", "aai__stack-item aai__btn--gemini", "aai__stack-item aai__btn--grok",
    ]);
    expect(Array.from(items()[0].querySelectorAll(".aai__name")).map((n) => n.textContent)).toEqual(["K", "Kagi"]);
  });
  it("label and strings.menu set the trigger text", () => {
    mount("#h", { ...base, label: "Ask a bot" });
    expect(trigger().textContent).toBe("Ask a bot");
    expect(menu().getAttribute("aria-label")).toBe("Ask a bot");
    mount("#h", { ...base, strings: { menu: "Frag die KI" } });
    expect(trigger().textContent).toBe("Frag die KI");
    mount("#h", { ...base, label: "L", strings: { menu: "Frag die KI" } });
    expect(trigger().textContent).toBe("L");
  });
  it("menuAlign end marks the menu, start does not", () => {
    mount("#h", { ...base, menuAlign: "end" });
    expect(menu().getAttribute("data-align")).toBe("end");
    mount("#h", { ...base, menuAlign: "start" });
    expect(menu().hasAttribute("data-align")).toBe(false);
  });
  it("menuIcons none drops the stack", () => {
    mount("#h", { ...base, menuIcons: "none" });
    expect(host.querySelector(".aai__stack")).toBeNull();
    expect(Array.from(trigger().children).map((c) => c.className)).toEqual(["aai__trigger-label", "aai__chevron"]);
  });
  it("keeps the built-in input next to the trigger", () => {
    mount("#h", { ...base, input: true });
    expect(Array.from(host.children).map((c) => c.className)).toEqual(["aai__form", "aai__trigger", "aai__list aai__menu", "aai__hint"]);
  });
});

describe("markup parity: mount, React SSR, Vue SSR", () => {
  const cases: Array<[string, any]> = [
    ["default", {}],
    ["label + end + brand", { label: "Ask", menuAlign: "end", variant: "brand" }],
    ["no stack", { menuIcons: "none" }],
    ["input", { input: { placeholder: "Q" } }],
    ["strings.menu", { strings: { menu: "Fragen" } }],
  ];
  for (const [name, extra] of cases) {
    it(name, async () => {
      const o = { ...base, ...extra };
      mount("#h", o);
      const r = Object.assign(document.createElement("div"), { innerHTML: renderToString(h(ReactAskAI, o)) });
      const v = Object.assign(document.createElement("div"), { innerHTML: await vueRender(createSSRApp({ render: () => vh(VueAskAI, o) })) });
      const mounted = host.cloneNode(true) as HTMLElement;
      mounted.removeAttribute("id");
      const wrap = document.createElement("div");
      wrap.append(mounted);
      expect(shape(r).split("><")).toEqual(shape(wrap).split("><"));
      expect(shape(v).split("><")).toEqual(shape(wrap).split("><"));
    });
  }
  it("React and Vue ids link trigger and menu", async () => {
    const r = Object.assign(document.createElement("div"), { innerHTML: renderToString(h(ReactAskAI, base)) });
    expect($("button", r).getAttribute("aria-controls")).toBe($(".aai__menu", r).id);
    expect($(".aai__menu", r).id).toBeTruthy();
    const v = Object.assign(document.createElement("div"), { innerHTML: await vueRender(createSSRApp({ render: () => vh(VueAskAI, base) })) });
    expect($("button", v).getAttribute("aria-controls")).toBe($(".aai__menu", v).id);
    expect($(".aai__menu", v).id).toBeTruthy();
  });
});

describe("opening and closing (mount)", () => {
  beforeEach(async () => { mount("#h", base); await ready(); });

  it("trigger click toggles", async () => {
    click(trigger());
    expect(isOpen()).toBe(true);
    click(trigger());
    expect(isOpen()).toBe(false);
    expect(menu().hasAttribute("hidden")).toBe(true);
  });
  it("ArrowDown, Enter and Space open and focus the first item", async () => {
    for (const k of ["ArrowDown", "Enter", " "]) {
      trigger().focus();
      const e = key(trigger(), k);
      expect(e.defaultPrevented).toBe(true);
      expect(isOpen()).toBe(true);
      expect(active()).toBe(items()[0]);
      key(items()[0], "Escape");
      expect(isOpen()).toBe(false);
    }
  });
  it("ArrowUp opens and focuses the last item", async () => {
    trigger().focus();
    key(trigger(), "ArrowUp");
    expect(active()).toBe(items()[3]);
  });
  it("arrows wrap, Home/End jump", async () => {
    trigger().focus();
    key(trigger(), "ArrowDown");
    key(active()!, "ArrowDown");
    expect(active()).toBe(items()[1]);
    key(active()!, "End");
    expect(active()).toBe(items()[3]);
    key(active()!, "ArrowDown");
    expect(active()).toBe(items()[0]);
    key(active()!, "ArrowUp");
    expect(active()).toBe(items()[3]);
    key(active()!, "Home");
    expect(active()).toBe(items()[0]);
  });
  it("type-ahead focuses the next item starting with the character", async () => {
    trigger().focus();
    key(trigger(), "ArrowDown"); // Claude
    key(active()!, "m"); // Mistral
    expect(active()).toBe(items()[3]);
    key(active()!, "G"); // Gemini
    expect(active()).toBe(items()[1]);
    key(active()!, "g"); // Grok (next g)
    expect(active()).toBe(items()[2]);
    key(active()!, "g"); // wraps to Gemini
    expect(active()).toBe(items()[1]);
    key(active()!, "z"); // no match: stays
    expect(active()).toBe(items()[1]);
  });
  it("Escape closes and returns focus to the trigger", async () => {
    trigger().focus();
    key(trigger(), "ArrowDown");
    key(active()!, "Escape");
    expect(isOpen()).toBe(false);
    expect(active()).toBe(trigger());
  });
  it("Tab closes without trapping focus", async () => {
    trigger().focus();
    key(trigger(), "ArrowDown");
    const e = key(active()!, "Tab");
    expect(e.defaultPrevented).toBe(false);
    expect(isOpen()).toBe(false);
  });
  it("pointerdown outside closes, inside does not", async () => {
    click(trigger());
    pointerdown(items()[0]);
    expect(isOpen()).toBe(true);
    pointerdown($("#other", document.body));
    expect(isOpen()).toBe(false);
  });
  it("binds the document listener only while open and removes it on destroy", async () => {
    const add = vi.spyOn(document, "addEventListener"), rm = vi.spyOn(document, "removeEventListener");
    const pd = (s: any) => s.mock.calls.filter((c: any[]) => c[0] === "pointerdown");
    expect(pd(add)).toHaveLength(0);
    click(trigger());
    expect(pd(add)).toHaveLength(1);
    click(trigger());
    expect(pd(rm)).toHaveLength(1);
    click(trigger());
    const inst = mount("#h", base)!; await ready(); // re-mount while open: old instance cleans up
    expect(pd(rm).length).toBeGreaterThanOrEqual(2);
    click(trigger());
    inst.destroy();
    const before = pd(rm).length;
    expect(before).toBeGreaterThanOrEqual(3);
    pointerdown($("#other", document.body)); // no-op after destroy
    expect(host.innerHTML).toBe("");
    add.mockRestore(); rm.mockRestore();
  });
  it("destroy removes the root listeners", async () => {
    const inst = mount("#h", base)!; await ready();
    inst.destroy();
    expect(host.innerHTML).toBe("");
    expect(host.dataset.layout).toBeUndefined();
  });
  it("update() from menu to row re-renders and closes", async () => {
    const inst = mount("#h", base)!; await ready();
    click(trigger());
    inst.update({ layout: "row" });
    expect(host.querySelector(".aai__trigger")).toBeNull();
    expect(host.dataset.layout).toBe("row");
    inst.update({ layout: "menu" });
    expect(isOpen()).toBe(false);
  });
});

describe("activating an item", () => {
  it("opens the service through the normal path, then closes", async () => {
    const onOpen = vi.fn();
    const ev = vi.fn();
    host.addEventListener("ask-ai:open", ev);
    mount("#h", { ...base, onOpen, prompt: "Hello" }); await ready();
    click(trigger());
    const a = items()[0];
    a.focus();
    const e = click(a);
    expect(e.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0][0]).toBe("https://claude.ai/new?q=Hello");
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ service: "claude" }));
    expect(ev).toHaveBeenCalledOnce();
    expect(isOpen()).toBe(false);
    expect(active()).toBe(trigger());
  });
  it("Space on an item activates it", async () => {
    mount("#h", { ...base, prompt: "Hello" }); await ready();
    trigger().focus();
    key(trigger(), "ArrowDown");
    key(active()!, "ArrowDown");
    key(active()!, " ");
    expect(open.mock.calls[0][0]).toContain("https://gemini.google.com/");
    expect(isOpen()).toBe(false);
  });
  it("modifier clicks keep the native href behaviour", async () => {
    const onOpen = vi.fn();
    mount("#h", { ...base, onOpen }); await ready();
    click(trigger());
    const e = click(items()[0], { ctrlKey: true });
    expect(e.defaultPrevented).toBe(false); // left to the browser
    expect(onOpen).not.toHaveBeenCalled();
  });
  it("hover refreshes the href with the live question", async () => {
    mount("#h", { ...base, input: true }); await ready();
    $<HTMLInputElement>(".aai__input").value = "fresh q";
    items()[0].dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(decodeURIComponent(items()[0].getAttribute("href")!)).toContain("fresh q");
  });
  it("Gemini copies the prompt and the hint stays visible after closing", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mount("#h", { ...base, prompt: "Hello" }); await ready();
    click(trigger());
    click(items()[1]);
    expect(writeText).toHaveBeenCalledWith("Hello");
    expect(isOpen()).toBe(false);
    const hint = $(".aai__hint");
    expect(hint.textContent).toContain("Gemini");
    expect(menu().contains(hint)).toBe(false);
  });
  it("an empty required question does not open, closes the menu and focuses the input", async () => {
    mount("#h", { ...base, input: true }); await ready();
    click(trigger());
    items()[0].focus();
    click(items()[0]);
    expect(open).not.toHaveBeenCalled();
    expect(isOpen()).toBe(false);
    expect(active()).toBe($(".aai__input"));
    expect($(".aai__input").getAttribute("aria-invalid")).toBe("true");
  });
  it("typing in the input does not trigger menu keys", async () => {
    mount("#h", { ...base, input: true }); await ready();
    const i = $(".aai__input");
    i.focus();
    key(i, "ArrowDown");
    expect(isOpen()).toBe(false);
  });
});

describe("placement", () => {
  const rect = (r: Partial<DOMRect>) => () => ({ top: 0, bottom: 0, height: 0, ...r }) as DOMRect;
  const setup = async (tr: Partial<DOMRect>, menuHeight: number, innerHeight: number) => {
    mount("#h", base); await ready();
    vi.stubGlobal("innerHeight", innerHeight);
    (window as any).innerHeight = innerHeight;
    trigger().getBoundingClientRect = rect(tr);
    menu().getBoundingClientRect = rect({ height: menuHeight });
  };
  it("stays below when it fits", async () => {
    await setup({ top: 100, bottom: 136 }, 250, 800);
    click(trigger());
    expect(menu().hasAttribute("data-placement")).toBe(false);
  });
  it("flips above when it does not fit below and there is more room above", async () => {
    await setup({ top: 600, bottom: 636 }, 250, 700);
    click(trigger());
    expect(menu().getAttribute("data-placement")).toBe("top");
    click(trigger()); // closed
    trigger().getBoundingClientRect = rect({ top: 10, bottom: 46 });
    click(trigger());
    expect(menu().hasAttribute("data-placement")).toBe(false);
  });
  it("stays below when there is more room below, even if it does not fit", async () => {
    await setup({ top: 100, bottom: 136 }, 900, 800);
    click(trigger());
    expect(menu().hasAttribute("data-placement")).toBe(false);
  });
  it("placeMenu offsets follow the trigger", async () => {
    mount("#h", base); await ready();
    const t = trigger();
    Object.defineProperties(t, { offsetTop: { value: 5 }, offsetHeight: { value: 36 }, offsetLeft: { value: 100 }, offsetWidth: { value: 90 } });
    Object.defineProperty(host, "clientWidth", { value: 400 });
    Object.defineProperty(host, "clientHeight", { value: 50 });
    placeMenu(host, t, menu());
    const s = menu().style;
    expect(s.getPropertyValue("--_mt")).toBe("45px");
    expect(s.getPropertyValue("--_ml")).toBe("100px");
    expect(s.getPropertyValue("--_mr")).toBe("210px");
    expect(s.getPropertyValue("--_mb")).toBe("49px");
  });
});

describe("React", () => {
  let root: Root;
  beforeEach(() => { root = createRoot(host); });
  afterEach(() => act(() => root.unmount()));
  const render = async (el: any) => { await act(() => root.render(el)); await ready(); };
  const c = (el: Element, init?: MouseEventInit) => act(() => { click(el, init); });
  const k = (el: Element, key_: string) => act(() => { key(el, key_); });

  it("opens, navigates, activates and closes", async () => {
    await render(h(ReactAskAI, { ...base, prompt: "Hello" }));
    await c(trigger());
    expect(isOpen()).toBe(true);
    await c(trigger());
    expect(isOpen()).toBe(false);
    trigger().focus();
    await k(trigger(), "ArrowUp");
    expect(active()).toBe(items()[3]);
    await k(active()!, "Home");
    expect(active()).toBe(items()[0]);
    await c(items()[0]);
    expect(open.mock.calls[0][0]).toBe("https://claude.ai/new?q=Hello");
    expect(isOpen()).toBe(false);
    expect(active()).toBe(trigger());
  });
  it("stays open across re-renders", async () => {
    await render(h(ReactAskAI, { ...base, prompt: "A" }));
    await c(trigger());
    await render(h(ReactAskAI, { ...base, prompt: "B" }));
    expect(isOpen()).toBe(true);
    await render(h(ReactAskAI, { ...base, prompt: "B", label: "New label", variant: "outline" }));
    expect(isOpen()).toBe(true);
    expect(trigger().textContent).toBe("New label");
  });
  it("outside pointerdown closes; unmount removes the document listener", async () => {
    await render(h(ReactAskAI, base));
    await c(trigger());
    pointerdown($("#other", document.body));
    expect(isOpen()).toBe(false);
    const rm = vi.spyOn(document, "removeEventListener");
    await c(trigger());
    await act(() => root.unmount());
    expect(rm.mock.calls.some((x) => x[0] === "pointerdown")).toBe(true);
    root = createRoot(host);
    rm.mockRestore();
  });
  it("required empty question focuses the input", async () => {
    await render(h(ReactAskAI, { ...base, input: true }));
    await c(trigger());
    await c(items()[0]);
    expect(open).not.toHaveBeenCalled();
    expect(isOpen()).toBe(false);
    expect(active()).toBe($(".aai__input"));
  });
  it("lite entry renders the menu too", async () => {
    await render(h(LiteReact, { services: [claude, chatgpt], layout: "menu" }));
    expect(items().map((a) => a.dataset.service)).toEqual(["claude", "chatgpt"]);
  });
});

describe("Vue", () => {
  const go = async (props: any) => {
    const p = { ...props };
    const app = createApp({ render: () => vh(VueAskAI, p) });
    app.mount(host);
    await ready();
    return { app, p };
  };
  it("opens, navigates, activates and closes", async () => {
    await go({ ...base, prompt: "Hello" });
    click(trigger());
    expect(isOpen()).toBe(true);
    key(trigger(), "Escape");
    expect(isOpen()).toBe(false);
    trigger().focus();
    key(trigger(), "ArrowDown");
    expect(active()).toBe(items()[0]);
    click(items()[0]);
    expect(open.mock.calls[0][0]).toBe("https://claude.ai/new?q=Hello");
    expect(isOpen()).toBe(false);
  });
  it("stays open across re-renders", async () => {
    const l = ref("A");
    createApp({ render: () => vh(VueAskAI, { ...base, label: l.value }) }).mount(host);
    await ready();
    click(trigger());
    l.value = "B";
    await nextTick();
    expect(trigger().textContent).toBe("B");
    expect(isOpen()).toBe(true);
  });
  it("unmount removes the document listener", async () => {
    const { app } = await go(base);
    click(trigger());
    const rm = vi.spyOn(document, "removeEventListener");
    app.unmount();
    expect(rm.mock.calls.some((x) => x[0] === "pointerdown")).toBe(true);
    rm.mockRestore();
  });
  it("outside pointerdown closes", async () => {
    await go(base);
    click(trigger());
    pointerdown($("#other", document.body));
    expect(isOpen()).toBe(false);
  });
});

describe("element, lite and CDN", () => {
  it("parseAttrs reads layout, menu-align and menu-icons (and data-*)", async () => {
    const d = document.createElement("div");
    d.setAttribute("layout", "menu");
    d.setAttribute("menu-align", "end");
    d.setAttribute("menu-icons", "none");
    expect(parseAttrs(d)).toEqual({ layout: "menu", menuAlign: "end", menuIcons: "none" });
    const e = document.createElement("div");
    e.setAttribute("data-layout", "menu");
    e.setAttribute("data-menu-icons", "none");
    expect(parseAttrs(e, "data-")).toEqual({ layout: "menu", menuIcons: "none" });
  });
  it("<ask-ai layout=menu> renders a working menu, and attribute changes switch layout", async () => {
    document.body.innerHTML = '<ask-ai id="e" services="claude,gemini" layout="menu" menu-align="end" menu-icons="none" context="none"></ask-ai>';
    const el = document.getElementById("e")!;
    await ready();
    expect(el.dataset.layout).toBe("menu");
    expect(el.querySelector(".aai__stack")).toBeNull();
    expect(el.querySelector(".aai__menu")!.getAttribute("data-align")).toBe("end");
    click(el.querySelector(".aai__trigger")!);
    expect(el.querySelector(".aai__menu")!.hasAttribute("hidden")).toBe(false);
    click(el.querySelector(".aai__menu .aai__btn")!);
    expect(open.mock.calls[0][0]).toContain("https://claude.ai/new");
    el.setAttribute("layout", "row");
    await Promise.resolve();
    expect(el.querySelector(".aai__trigger")).toBeNull();
    (el as any).layout = "menu";
    await Promise.resolve();
    expect(el.querySelector(".aai__trigger")).toBeTruthy();
  });
  it("lite mount supports the menu", async () => {
    lite.mount("#h", { services: [claude], layout: "menu" }); await ready();
    expect(trigger()).toBeTruthy();
    click(trigger());
    expect(isOpen()).toBe(true);
  });
  it("CDN data-layout auto-mount", async () => {
    document.body.innerHTML = '<div data-ask-ai data-services="claude,grok" data-layout="menu" data-menu-icons="none" data-label="Ask"></div>';
    const AskAI = await import("../src/cdn");
    AskAI.init();
    const d = document.querySelector<HTMLElement>("[data-ask-ai]")!;
    expect(d.dataset.layout).toBe("menu");
    expect(d.querySelector(".aai__trigger-label")!.textContent).toBe("Ask");
    expect(d.querySelector(".aai__stack")).toBeNull();
    expect(d.querySelectorAll(".aai__menu .aai__btn")).toHaveLength(2);
  });
});
