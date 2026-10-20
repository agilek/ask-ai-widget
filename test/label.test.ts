// labelPosition: left | top | right | bottom | none. Markup is identical in every renderer, the label stays first in the DOM
// (placement is CSS only), "none" renders no visible label but keeps the accessible name, the menu layout ignores it.
import { describe, it, expect, beforeEach } from "vitest";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { createSSRApp, h as vh } from "vue";
import { renderToString as vueRender } from "@vue/server-renderer";
import { mount } from "../src";
import { AskAI as ReactAskAI } from "../src/react";
import { AskAI as VueAskAI } from "../src/vue";
import { parseAttrs } from "../src/element";
import "../src/element";

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="h"></div>';
  host = document.getElementById("h")!;
});

const POSITIONS = ["left", "top", "right", "bottom", "none"] as const;
const base = { services: ["claude", "gemini"], label: "Ask AI about this page", context: false as const };

/** Structural serialisation (sorted attributes, ids and framework-only attributes removed) to compare renderers. */
function shape(root: Element): string {
  const walk = (n: Element): string => {
    const attrs = Array.from(n.attributes)
      .filter((a) => !["id", "aria-controls", "data-allow-mismatch"].includes(a.name) && !(a.name === "style" && !a.value) && !(a.name === "value" && !a.value))
      .map((a) => `${a.name}=${a.name === "style" ? a.value.replace(/[\s;]/g, "") : a.value}`)
      .sort();
    return `<${n.tagName.toLowerCase()} ${attrs.join(" ")}>${Array.from(n.childNodes).map((c) => (c.nodeType === 1 ? walk(c as Element) : c.textContent)).join("")}</>`;
  };
  return Array.from(root.children).map(walk).join("");
}
const box = (html: string) => Object.assign(document.createElement("div"), { innerHTML: html });

describe("labelPosition markup", () => {
  for (const pos of POSITIONS)
    for (const extra of [{}, { input: true }, { layout: "menu" as const }])
      it(`parity of mount, React SSR and Vue SSR: ${pos} ${JSON.stringify(extra)}`, async () => {
        const o = { ...base, ...extra, labelPosition: pos };
        mount("#h", o);
        const mounted = host.cloneNode(true) as HTMLElement;
        mounted.removeAttribute("id");
        const wrap = box("");
        wrap.append(mounted);
        const r = box(renderToString(h(ReactAskAI, o)));
        const v = box(await vueRender(createSSRApp({ render: () => vh(VueAskAI, o) })));
        expect(shape(r).split("><")).toEqual(shape(wrap).split("><"));
        expect(shape(v).split("><")).toEqual(shape(wrap).split("><"));
      });

  it("puts the position on the root as data-label-position (left by default)", () => {
    mount("#h", base);
    expect(host.dataset.labelPosition).toBe("left");
    for (const pos of ["top", "right", "bottom", "none"] as const) {
      mount("#h", { ...base, labelPosition: pos });
      expect(host.dataset.labelPosition).toBe(pos);
    }
  });
  it("update() switches the position and keeps the label span (except for none)", () => {
    const inst = mount("#h", base)!;
    inst.update({ labelPosition: "bottom" });
    expect(host.dataset.labelPosition).toBe("bottom");
    expect(host.querySelector(".aai__label")!.textContent).toBe(base.label);
    inst.update({ labelPosition: "none" });
    expect(host.querySelector(".aai__label")).toBeNull();
    inst.update({ labelPosition: "left" });
    expect(host.dataset.labelPosition).toBe("left");
    expect(host.querySelector(".aai__label")).toBeTruthy();
  });
  it("the label is the FIRST child in every position and renderer, placement is CSS only", async () => {
    for (const pos of ["left", "top", "right", "bottom"] as const)
      for (const extra of [{}, { input: true }]) {
        const o = { ...base, ...extra, labelPosition: pos };
        mount("#h", o);
        expect(host.firstElementChild!.className).toBe("aai__label");
        expect(box(renderToString(h(ReactAskAI, o))).firstElementChild!.firstElementChild!.className).toBe("aai__label");
        expect(box(await vueRender(createSSRApp({ render: () => vh(VueAskAI, o) }))).firstElementChild!.firstElementChild!.className).toBe("aai__label");
      }
  });
});

describe("labelPosition none", () => {
  it("renders no label span but keeps the accessible name of the group (all renderers)", async () => {
    const o = { ...base, labelPosition: "none" as const };
    mount("#h", o);
    expect(host.querySelector(".aai__label")).toBeNull();
    expect(host.querySelector(".aai__list")!.getAttribute("aria-label")).toBe(base.label);
    const r = box(renderToString(h(ReactAskAI, o)));
    expect(r.querySelector(".aai__label")).toBeNull();
    expect(r.querySelector(".aai__list")!.getAttribute("aria-label")).toBe(base.label);
    const v = box(await vueRender(createSSRApp({ render: () => vh(VueAskAI, o) })));
    expect(v.querySelector(".aai__label")).toBeNull();
    expect(v.querySelector(".aai__list")!.getAttribute("aria-label")).toBe(base.label);
  });
});

describe("menu layout ignores labelPosition", () => {
  it("no label span, the trigger text stays the label, the root says left", () => {
    for (const pos of POSITIONS) {
      mount("#h", { ...base, layout: "menu", labelPosition: pos });
      expect(host.querySelector(".aai__label")).toBeNull();
      expect(host.querySelector(".aai__trigger-label")!.textContent).toBe(base.label);
      expect(host.dataset.labelPosition).toBe("left");
    }
  });
});

describe("element and CDN attributes", () => {
  it("parseAttrs reads label-position and data-label-position", () => {
    const d = document.createElement("div");
    d.setAttribute("label-position", "top");
    expect(parseAttrs(d)).toEqual({ labelPosition: "top" });
    const e = document.createElement("div");
    e.setAttribute("data-label-position", "none");
    expect(parseAttrs(e, "data-")).toEqual({ labelPosition: "none" });
  });
  it("<ask-ai label-position> renders and follows attribute changes", async () => {
    document.body.innerHTML = '<ask-ai id="e" services="claude" label="Ask" label-position="right" context="none"></ask-ai>';
    const el = document.getElementById("e")!;
    expect(el.dataset.labelPosition).toBe("right");
    el.setAttribute("label-position", "none");
    await Promise.resolve();
    expect(el.querySelector(".aai__label")).toBeNull();
    expect(el.querySelector(".aai__list")!.getAttribute("aria-label")).toBe("Ask");
    (el as any).labelPosition = "bottom";
    await Promise.resolve();
    expect(el.dataset.labelPosition).toBe("bottom");
  });
});
