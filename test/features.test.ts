// Cross-renderer behaviour: showLabels on icon-less services, optional external input, strings (i18n),
// selection capture in the wrappers, registry export and lite typing.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement as h, act } from "react";
import { renderToString } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { createApp, createSSRApp, h as vh } from "vue";
import { renderToString as vueRender } from "@vue/server-renderer";
import * as core from "../src";
import { mount, registry } from "../src";
import { AskAI as ReactAskAI } from "../src/react";
import { AskAI as VueAskAI } from "../src/vue";
import * as lite from "../src/lite";
import { AskAI as LiteReact } from "../src/lite/react";
import { claude } from "../src/builtins";
import { parseAttrs } from "../src/element";
import type { LiteAskAIOptions } from "../src/types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement, open: ReturnType<typeof vi.fn>;
beforeEach(() => {
  document.body.innerHTML = '<div id="h"></div><input id="q">';
  document.title = "Doc";
  host = document.getElementById("h")!;
  open = vi.fn();
  window.open = open as any;
});
afterEach(() => vi.unstubAllGlobals());

const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
const btn = (k: string) => host.querySelector<HTMLAnchorElement>(`.aai__btn--${k}`)!;
const names = (el: ParentNode) => Array.from(el.querySelectorAll(".aai__name")).map((n) => n.textContent);
const noIcon = { key: "kagi", label: "Kagi", url: "https://kagi.test/", param: "q" };

describe("showLabels on services without an icon", () => {
  it("mount: letter glyph, then the name", () => {
    mount("#h", { services: [noIcon, "claude"], showLabels: true });
    expect(names(btn("kagi"))).toEqual(["K", "Kagi"]);
    expect(names(btn("claude"))).toEqual(["Claude"]);
  });
  it("mount: letter only without showLabels", () => {
    mount("#h", { services: [noIcon] });
    expect(names(btn("kagi"))).toEqual(["K"]);
  });
  it("React and Vue render the same", async () => {
    const r = renderToString(h(ReactAskAI, { services: [noIcon], showLabels: true }));
    expect(r).toContain('<span class="aai__name">K</span><span class="aai__name">Kagi</span>');
    const v = await vueRender(createSSRApp({ render: () => vh(VueAskAI, { services: [noIcon], showLabels: true }) }));
    expect(v).toContain('<span class="aai__name">K</span><span class="aai__name">Kagi</span>');
  });
});

describe("external input is not always required", () => {
  const ask = (input: any) => {
    mount("#h", { services: ["claude"], input, context: false });
    click(btn("claude"));
  };
  it("{ target, required: false } with a selector opens on an empty question", () => {
    ask({ target: "#q", required: false });
    expect(open).toHaveBeenCalledOnce();
    expect(host.querySelector(".aai__input")).toBeNull(); // bound, not rendered
  });
  it("{ target, required: false } with an element", () => {
    ask({ target: document.getElementById("q"), required: false });
    expect(open).toHaveBeenCalledOnce();
  });
  it("the typed value still flows into the prompt", () => {
    (document.getElementById("q") as HTMLInputElement).value = " hi ";
    ask({ target: "#q", required: false });
    expect(decodeURIComponent(open.mock.calls[0][0].split("q=")[1])).toBe("hi");
  });
  it("stays required by default, in every existing form", () => {
    for (const input of ["#q", document.getElementById("q"), { target: "#q" }, { target: "#q", required: true }]) {
      open.mockClear();
      ask(input);
      expect(open).not.toHaveBeenCalled();
      expect(document.getElementById("q")!.getAttribute("aria-invalid")).toBe("true");
      document.getElementById("q")!.removeAttribute("aria-invalid");
    }
  });
  it("Enter in a bound optional field opens the first service", () => {
    mount("#h", { services: ["claude"], input: { target: "#q", required: false }, context: false });
    document.getElementById("q")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(open).toHaveBeenCalledOnce();
  });
  it("element attributes and data-* attributes", () => {
    const el = (a: Record<string, string>) => {
      const d = document.createElement("div");
      for (const k in a) d.setAttribute(k, a[k]);
      return d;
    };
    expect(parseAttrs(el({ input: "#q", required: "false" })).input).toEqual({ target: "#q", required: false });
    expect(parseAttrs(el({ "data-input": "#q", "data-required": "false" }), "data-").input).toEqual({ target: "#q", required: false });
    expect(parseAttrs(el({ input: "#q", required: "true" })).input).toEqual({ target: "#q", required: true });
    expect(parseAttrs(el({ input: "#q" })).input).toBe("#q");
  });
  it("<ask-ai input='#q' required='false'> opens with an empty field", () => {
    document.body.insertAdjacentHTML("beforeend", '<ask-ai services="claude" input="#q" required="false" context="none"></ask-ai>');
    click(document.querySelector<HTMLAnchorElement>("ask-ai .aai__btn--claude")!);
    expect(open).toHaveBeenCalledOnce();
  });
});

describe("strings (i18n)", () => {
  const strings = { ask: "Frage {service}", question: "Deine Frage", copied: "Kopiert, füge es in {service} ein" };
  it("mount: button label/title, input label and copied hint", () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    mount("#h", { services: ["claude", "gemini"], input: true, strings, context: false });
    expect(btn("claude").getAttribute("aria-label")).toBe("Frage Claude");
    expect(btn("claude").getAttribute("title")).toBe("Frage Claude");
    expect(host.querySelector(".aai__input")!.getAttribute("aria-label")).toBe("Deine Frage");
    (host.querySelector(".aai__input") as HTMLInputElement).value = "x";
    click(btn("gemini"));
    expect(host.querySelector(".aai__hint")!.textContent).toBe("Kopiert, füge es in Gemini ein");
  });
  it("defaults are unchanged and partial strings fall back per key", () => {
    mount("#h", { services: ["claude"], input: true, strings: { ask: "Open {service}" } });
    expect(btn("claude").getAttribute("aria-label")).toBe("Open Claude");
    expect(host.querySelector(".aai__input")!.getAttribute("aria-label")).toBe("Your question");
  });
  it("a `$` in a service label is not treated as a replacement pattern", () => {
    mount("#h", { services: [{ ...noIcon, label: "A$&B" }] });
    expect(btn("kagi").getAttribute("aria-label")).toBe("Ask A$&B");
  });
  it("React and Vue", async () => {
    const r = renderToString(h(ReactAskAI, { services: ["claude"], input: true, strings }));
    expect(r).toContain('aria-label="Frage Claude"');
    expect(r).toContain('title="Frage Claude"');
    expect(r).toContain('aria-label="Deine Frage"');
    const v = await vueRender(createSSRApp({ render: () => vh(VueAskAI, { services: ["claude"], input: true, strings }) }));
    expect(v).toContain('aria-label="Frage Claude"');
    expect(v).toContain('title="Frage Claude"');
    expect(v).toContain('aria-label="Deine Frage"');
  });
  it("<ask-ai strings='{...}'> and data-strings", () => {
    document.body.insertAdjacentHTML("beforeend", `<ask-ai services="claude" strings='${JSON.stringify(strings)}'></ask-ai>`);
    expect(document.querySelector("ask-ai .aai__btn--claude")!.getAttribute("aria-label")).toBe("Frage Claude");
    const d = document.createElement("div");
    d.setAttribute("data-strings", JSON.stringify(strings));
    expect(parseAttrs(d, "data-").strings).toEqual(strings);
  });
});

describe("{selection} in the wrappers", () => {
  const sel = (text: string) => vi.stubGlobal("getSelection", () => ({ toString: () => text }));
  const down = (el: Element) => el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  const focusin = (el: Element) => el.dispatchEvent(new Event("focusin", { bubbles: true }));
  const prompt = () => decodeURIComponent(open.mock.calls[0][0].split("q=")[1]);

  it("React captures on pointerdown, even if the press clears the selection", async () => {
    const root: Root = createRoot(host);
    sel("picked text");
    await act(() => root.render(h(ReactAskAI, { services: ["claude"], prompt: "About: {selection}", context: false })));
    const a = btn("claude");
    await act(() => { down(a); });
    sel("");
    await act(() => { focusin(a); }); // mouse focus right after the press must not wipe the capture
    await act(() => { click(a); });
    expect(prompt()).toBe("About: picked text");
    await act(() => root.unmount());
  });
  it("Vue captures on pointerdown, even if the press clears the selection", async () => {
    sel("picked text");
    createApp({ render: () => vh(VueAskAI, { services: ["claude"], prompt: "About: {selection}", context: false }) }).mount(host);
    const a = btn("claude");
    down(a);
    sel("");
    focusin(a);
    click(a);
    expect(prompt()).toBe("About: picked text");
  });
});

describe("registry export", () => {
  it("is called `registry` in the default and lite entries; `services` is gone", () => {
    expect(core.registry).toBe(lite.registry);
    expect("services" in core).toBe(false);
    expect("services" in lite).toBe(false);
    core.registerService({ ...noIcon });
    expect(registry.kagi).toBeDefined();
    delete registry.kagi;
  });
});

describe("lite typing", () => {
  it("accepts service objects and strings (registered ones) in the lite mount and React props (element: see lite.test.ts)", () => {
    const opts: LiteAskAIOptions = { services: [claude, "kagi"] };
    expect(lite.getItems({ services: [claude] }, "").length).toBe(1);
    expect(lite.mount("#h", opts)).not.toBeNull();
    const props: Parameters<typeof LiteReact>[0] = { services: [claude, "kagi"] };
    expect(props.services).toHaveLength(2);
  });
});
