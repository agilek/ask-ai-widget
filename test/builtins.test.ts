import { describe, it, expect, vi, afterEach } from "vitest";
import * as svc from "../src/builtins";
import { builtins } from "../src/builtins";
import { withBuiltins, registerService, registry, resolveServices, getItems, mount } from "../src";

const keys = ["chatgpt", "claude", "perplexity", "gemini", "grok", "mistral", "deepseek"];
afterEach(() => { for (const k of Object.keys(registry)) delete registry[k]; vi.restoreAllMocks(); });

describe("services entry", () => {
  it("exports one def per service and the ordered array", () => {
    expect(builtins.map((s) => s.key)).toEqual(keys);
    for (const k of keys) {
      const d = (svc as any)[k];
      expect(d).toBe(builtins.find((b) => b.key === k));
      expect(d).toMatchObject({ key: k, param: "q" });
      expect(d.label && d.url && d.icon).toBeTruthy();
    }
    expect(svc.claude).toMatchObject({ url: "https://claude.ai/new", color: "#D97757" });
    expect(svc.gemini.prefill).toBe(false);
  });
  it("has no other runtime exports", () => {
    expect(Object.keys(svc).sort()).toEqual([...keys, "builtins"].sort());
  });
});

describe("withBuiltins", () => {
  it("maps string keys to built-ins, case-insensitively", () => {
    const o = withBuiltins({ services: ["Claude", "GROK", "chatgpt"] });
    expect(o.services).toEqual([svc.claude, svc.grok, svc.chatgpt]);
  });
  it("defaults services to the built-ins in order", () => {
    expect(withBuiltins().services).toEqual(builtins);
    expect(withBuiltins({ label: "x" })).toMatchObject({ label: "x", services: builtins });
  });
  it("passes inline defs through and does not mutate its input", () => {
    const inline = { key: "x", label: "X", url: "https://x.test/", param: "p" };
    const input = { services: ["claude", inline] };
    const o = withBuiltins(input);
    expect(o.services).toEqual([svc.claude, inline]);
    expect(input.services[0]).toBe("claude");
  });
  it("registry overrides win, in place for the default list, extras are appended", () => {
    const over = { ...svc.grok, url: "https://override.test/" };
    registerService(over);
    expect(withBuiltins({ services: ["grok"] }).services).toEqual([over]);
    const extra = { key: "mine", label: "Mine", url: "https://m.test/", param: "q" };
    registerService(extra);
    const all = withBuiltins().services!;
    expect(all).toHaveLength(8);
    expect(all[4]).toBe(over);
    expect(all[7]).toBe(extra);
  });
  it("is idempotent", () => {
    const once = withBuiltins({ services: ["claude"] });
    expect(withBuiltins(once)).toEqual(once);
  });
  it("leaves unknown keys for the core to warn about", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(withBuiltins({ services: ["nope", "constructor"] }).services).toEqual(["nope", "constructor"]);
    const items = getItems({ services: ["claude", "nope"] });
    expect(items.map((i) => i.key)).toEqual(["claude"]);
    expect(warn).toHaveBeenCalledWith('[ask-ai] unknown service "nope"');
  });
  it("is what the default getItems, resolveServices and mount use", () => {
    expect(getItems({ services: ["Gemini"] })[0].prefill).toBe(false);
    expect(resolveServices().map((s) => s.key)).toEqual(keys);
    document.body.innerHTML = '<div id="h"></div>';
    mount("#h", { services: ["CLAUDE", "grok"] });
    expect(document.querySelectorAll("#h .aai__btn")).toHaveLength(2);
  });
});
