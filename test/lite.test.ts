import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { createSSRApp, h as vh } from "vue";
import { renderToString as vueRender } from "@vue/server-renderer";
import * as lite from "../src/lite";
import { AskAI as LiteReact } from "../src/lite/react";
import { AskAI as LiteVue } from "../src/lite/vue";
import { askAI } from "../src/lite/svelte";
import { AskAIElement, defineAskAI } from "../src/lite/element";
import { claude, grok } from "../src/builtins";

const unknown = (k: string) =>
  `[ask-ai] Unknown service "${k}". With ask-ai-widget/lite pass the object: import { ${k} } from "ask-ai-widget/services"`;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  document.body.innerHTML = '<div id="h"></div>';
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  window.open = vi.fn() as any;
});
afterEach(() => {
  for (const k of Object.keys(lite.registry)) delete lite.registry[k];
  vi.restoreAllMocks();
});

describe("lite core", () => {
  it("works with objects", () => {
    const items = lite.getItems({ services: [claude, grok], context: false });
    expect(items.map((i) => i.key)).toEqual(["claude", "grok"]);
    expect(items[0].href).toBe("https://claude.ai/new?q=Explain%20this%20page.");
    expect(warn).not.toHaveBeenCalled();
  });
  it("does not resolve built-in string keys and warns with the import hint", () => {
    expect(lite.getItems({ services: ["claude"] })).toEqual([]);
    expect(warn).toHaveBeenCalledWith(unknown("claude"));
    expect(lite.resolveServices(["Grok"])).toEqual([]);
    expect(warn).toHaveBeenLastCalledWith(unknown("grok").replace('"grok"', '"Grok"'));
  });
  it("warns generically for other unknown keys and keeps the valid ones", () => {
    const items = lite.getItems({ services: ["nope", grok] });
    expect(items.map((i) => i.key)).toEqual(["grok"]);
    expect(warn).toHaveBeenCalledWith('[ask-ai] Unknown service "nope". Pass a service object or call registerService().');
  });
  it("resolves registered keys, case-insensitively", () => {
    lite.registerService(claude);
    expect(lite.getItems({ services: ["CLAUDE"] }).map((i) => i.key)).toEqual(["claude"]);
    expect(warn).not.toHaveBeenCalled();
  });
  it("defaults to every registered service", () => {
    lite.registerService(claude);
    lite.registerService(grok);
    expect(lite.resolveServices().map((s) => s.key)).toEqual(["claude", "grok"]);
    expect(lite.getItems({}).map((i) => i.key)).toEqual(["claude", "grok"]);
  });
  it("warns once when nothing is registered and services is omitted", async () => {
    vi.resetModules();
    const fresh = await import("../src/lite");
    expect(fresh.getItems({})).toEqual([]);
    expect(fresh.getItems({})).toEqual([]);
    const calls = warn.mock.calls.filter((c: unknown[]) => String(c[0]).includes("No services"));
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toContain('import { claude } from "ask-ai-widget/services"');
  });
  it("mount renders objects and survives string keys", () => {
    const inst = lite.mount("#h", { services: [claude, "grok"] })!;
    expect(document.querySelectorAll("#h .aai__btn")).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(unknown("grok"));
    inst.update({ services: [claude, grok] });
    expect(document.querySelectorAll("#h .aai__btn")).toHaveLength(2);
    inst.destroy();
  });
  it("activate opens a service object", () => {
    expect(lite.activate(null, "claude", { services: [claude], context: false }, "")).toBe(true);
    expect((window.open as any).mock.calls[0][0]).toContain("https://claude.ai/new?q=");
  });
});

describe("lite wrappers", () => {
  it("React", () => {
    const html = renderToString(h(LiteReact, { services: [claude, grok, "gemini"], context: false }));
    expect(html).toContain('data-service="claude"');
    expect(html).toContain('data-service="grok"');
    expect(html).not.toContain('data-service="gemini"');
    expect(warn).toHaveBeenCalledWith(unknown("gemini"));
  });
  it("Vue", async () => {
    const html = await vueRender(createSSRApp({ render: () => vh(LiteVue, { services: [claude, "claude"] }) }));
    expect(html.match(/data-service="claude"/g)).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(unknown("claude"));
  });
  it("Svelte action", () => {
    const node = document.getElementById("h")!;
    const a = askAI(node, { services: [claude] }) as { update(o: any): void; destroy(): void };
    expect(node.querySelectorAll(".aai__btn")).toHaveLength(1);
    a.update({ services: [claude, grok] });
    expect(node.querySelectorAll(".aai__btn")).toHaveLength(2);
    a.destroy();
  });
  it("element", async () => {
    expect(customElements.get("ask-ai")).toBeDefined();
    expect(() => defineAskAI()).not.toThrow();
    const el = new AskAIElement();
    el.services = [claude, grok];
    document.body.append(el);
    expect(el.querySelectorAll(".aai__btn")).toHaveLength(2);
  });
});

describe("lite typing", () => {
  it("the element's services property accepts objects and strings", () => {
    const el = new AskAIElement();
    el.services = [claude, "kagi"];
    expect(el.services).toHaveLength(2);
  });
});
