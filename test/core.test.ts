import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkCss, specificity } from "../scripts/css-check.mjs";
import { buildUrl, render, buildPrompt, getContext, resolveServices, registerService, registry, getItems, css, injectStyles } from "../src";
import type { PromptContext } from "../src";
import * as svc from "../src/builtins";

const ctx = (o: Partial<PromptContext> = {}): PromptContext =>
  ({ service: "claude", question: "", url: "https://x.test/p", title: "Page", description: "", selection: "", vars: {}, ...o });

describe("buildUrl", () => {
  it("encodes the prompt", () => {
    expect(buildUrl({ url: "https://a.test/", param: "q" }, "a b&c=d?é")).toBe("https://a.test/?q=a%20b%26c%3Dd%3F%C3%A9");
  });
  it("handles existing query", () => {
    expect(buildUrl({ url: "https://a.test/?x=1", param: "q" }, "hi")).toBe("https://a.test/?x=1&q=hi");
    expect(buildUrl({ url: "https://a.test/?", param: "q" }, "hi")).toBe("https://a.test/?q=hi");
  });
});

describe("render", () => {
  it("fills fields, vars and drops unknowns", () => {
    const c = ctx({ question: "why?", vars: { brand: "Example" } });
    expect(render("{brand}: {question} @ {title} {nope} {vars} {constructor}", c)).toBe("Example: why? @ Page   ");
  });
});

describe("getContext", () => {
  it("reads the document", () => {
    document.head.innerHTML = '<meta name="description" content="Desc">';
    document.title = "Hello";
    const c = getContext({ vars: { a: "1" } }, "q", "claude");
    expect(c).toMatchObject({ title: "Hello", description: "Desc", question: "q", service: "claude", vars: { a: "1" } });
    expect(c.url).toContain("http");
  });
});

describe("buildPrompt", () => {
  it("defaults without input", () => {
    expect(buildPrompt({}, ctx())).toBe("Explain this page.\n\nContext: Page — https://x.test/p");
  });
  it("defaults with input uses question", () => {
    expect(buildPrompt({ input: true }, ctx({ question: "What?" }))).toBe("What?\n\nContext: Page — https://x.test/p");
  });
  it("avoids dangling dash when title empty", () => {
    expect(buildPrompt({}, ctx({ title: "" }))).toBe("Explain this page.\n\nContext: https://x.test/p");
  });
  it("accepts strings and functions", () => {
    const p = buildPrompt(
      { instructions: "Be brief about {title}", prompt: (c) => `Q:${c.service}`, context: (c) => `U:${c.url}` },
      ctx(),
    );
    expect(p).toBe("Be brief about Page\n\nQ:claude\n\nU:https://x.test/p");
  });
  it("context:false disables context", () => {
    expect(buildPrompt({ context: false }, ctx())).toBe("Explain this page.");
  });
  it("supports a custom template with parts and fields", () => {
    expect(buildPrompt({ template: "[{prompt}] <{context}> {service}", instructions: "i" }, ctx())).toBe(
      "[Explain this page.] <Context: Page — https://x.test/p> claude",
    );
  });
  it("leaves no stray blank lines", () => {
    const p = buildPrompt({ instructions: "", context: "" }, ctx());
    expect(p).toBe("Explain this page.");
    const q = buildPrompt({ instructions: "I", context: false }, ctx());
    expect(q).toBe("I\n\nExplain this page.");
    expect(buildPrompt({ instructions: "I", prompt: "P", context: "C" }, ctx())).not.toMatch(/\n{3}/);
  });
  it("truncates context first, then instructions, never the question first", () => {
    const o = { instructions: "I".repeat(50), prompt: "Q".repeat(20), context: "C".repeat(50) };
    let p = buildPrompt({ ...o, maxLength: 100 }, ctx());
    expect(p.length).toBeLessThanOrEqual(100);
    expect(p).toContain("I".repeat(50));
    expect(p).toContain("Q".repeat(20));
    expect(p).toContain("…");
    p = buildPrompt({ ...o, maxLength: 60 }, ctx());
    expect(p.length).toBeLessThanOrEqual(60);
    expect(p).not.toContain("C");
    expect(p).toContain("Q".repeat(20));
    expect(p).toContain("I");
    p = buildPrompt({ ...o, maxLength: 15 }, ctx());
    expect(p.length).toBeLessThanOrEqual(15);
    expect(p).not.toContain("I");
    expect(p).toMatch(/^Q+…$/);
  });
});

describe("buildPrompt truncation edge cases", () => {
  it("never exceeds maxLength, even for tiny limits and a long question", () => {
    for (const max of [0, 1, 5, 10, 23, 60]) {
      expect(buildPrompt({ instructions: "I".repeat(30), prompt: "Q".repeat(40), context: "C".repeat(30), maxLength: max }, ctx()).length).toBeLessThanOrEqual(max);
    }
  });
  it("cuts exactly to the limit with an ellipsis (no off-by-one)", () => {
    const p = buildPrompt({ prompt: "Q", context: "C".repeat(30), maxLength: 20 }, ctx());
    expect(p).toBe("Q\n\n" + "C".repeat(16) + "…");
    expect(p.length).toBe(20);
  });
  it("fits exactly at the limit without cutting", () => {
    const o = { prompt: "Q".repeat(10), context: "C".repeat(10) };
    expect(buildPrompt({ ...o, maxLength: 22 }, ctx())).toBe(`${o.prompt}\n\n${o.context}`);
  });
  it("handles empty parts and trims before the ellipsis", () => {
    expect(buildPrompt({ instructions: "", context: "", prompt: "Q".repeat(10), maxLength: 5 }, ctx())).toBe("QQQQ…");
    const p = buildPrompt({ prompt: "Q", context: "word word word word", maxLength: 12 }, ctx());
    expect(p).not.toMatch(/\s…/);
    expect(p.length).toBeLessThanOrEqual(12);
  });
  it("never splits a surrogate pair (encodeURIComponent would throw)", () => {
    for (let max = 1; max < 12; max++) {
      const p = buildPrompt({ prompt: "😀".repeat(10), context: false, maxLength: max }, ctx());
      expect(() => encodeURIComponent(p)).not.toThrow();
      expect(p.length).toBeLessThanOrEqual(max);
    }
    const q = buildPrompt({ prompt: "Q", context: "😀".repeat(20), maxLength: 12 }, ctx());
    expect(() => encodeURIComponent(q)).not.toThrow();
  });
});

describe("references", () => {
  const base = { context: false as const, prompt: "P" };
  it("resolves relative URLs against the page, dedupes and drops empties", () => {
    const p = buildPrompt({ ...base, references: ["/llms.txt", "", "  ", "https://a.test/x", "/llms.txt", new URL("/llms.txt", location.href).href] }, ctx());
    const abs = new URL("/llms.txt", location.href).href;
    expect(p).toBe(`P\n\nUse these sources:\n- ${abs}\n- https://a.test/x`);
  });
  it("accepts a function of the context", () => {
    expect(buildPrompt({ ...base, references: (c) => [`https://a.test/${c.service}`] }, ctx())).toBe("P\n\nUse these sources:\n- https://a.test/claude");
  });
  it("is empty (no stray separators) when there are none", () => {
    expect(buildPrompt({ ...base, references: [] }, ctx())).toBe("P");
    expect(buildPrompt({ ...base, references: ["", " "] }, ctx())).toBe("P");
    expect(buildPrompt({ ...base, references: () => [] }, ctx())).toBe("P");
  });
  it("sits after the context in the default template", () => {
    expect(buildPrompt({ prompt: "P", references: ["https://a.test/"] }, ctx())).toBe("P\n\nContext: Page — https://x.test/p\n\nUse these sources:\n- https://a.test/");
  });
  it("supports {references} in a custom template", () => {
    expect(buildPrompt({ template: "{references} || {prompt}", prompt: "P", references: ["https://a.test/"] }, ctx())).toBe("Use these sources:\n- https://a.test/ || P");
  });
  it("truncation order: context, then whole reference lines, then instructions", () => {
    const o = { instructions: "I".repeat(20), prompt: "P", context: "C".repeat(30), references: ["https://a.test/one", "https://a.test/two", "https://a.test/three"] };
    const full = buildPrompt(o, ctx());
    // fits after dropping the last URL: context is gone first
    let p = buildPrompt({ ...o, maxLength: full.length - 32 }, ctx());
    expect(p).not.toContain("C");
    expect(p).toContain("https://a.test/three");
    p = buildPrompt({ ...o, maxLength: 20 + 2 + 1 + 2 + "Use these sources:\n- https://a.test/one".length }, ctx());
    expect(p).toContain("https://a.test/one");
    expect(p).not.toContain("two");
    expect(p).toContain("I".repeat(20));
    // every kept URL is whole
    for (const max of [40, 60, 80, 100, 120]) {
      const r = buildPrompt({ ...o, maxLength: max }, ctx());
      for (const m of r.matchAll(/- (\S+)/g)) expect(o.references).toContain(m[1]);
    }
    p = buildPrompt({ ...o, maxLength: 10 }, ctx());
    expect(p).not.toContain("Use these");
    expect(p).toBe("IIIIII…\n\nP");
  });
});

describe("services", () => {
  it("has built-ins in order", () => {
    expect(resolveServices().map((s) => s.key)).toEqual(["chatgpt", "claude", "perplexity", "gemini", "grok", "mistral", "deepseek"]);
    expect(svc.gemini.prefill).toBe(false);
    expect(svc.deepseek.prefill).toBe(false);
    expect(svc.mistral).toMatchObject({ url: "https://chat.mistral.ai/chat", color: "#FA500F" });
    expect(svc.mistral.icon && svc.deepseek.icon).toBeTruthy();
    expect(svc.claude.icon).toBeTruthy();
  });
  it("resolves case-insensitively, inline defs, drops unknown", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const inline = { key: "x", label: "X", url: "https://x.test/", param: "p" };
    const r = resolveServices(["Claude", "nope", inline]);
    expect(r.map((s) => s.key)).toEqual(["claude", "x"]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
  it("registerService overrides", () => {
    registerService({ ...svc.grok, url: "https://override.test/" });
    expect(resolveServices(["grok"])[0].url).toBe("https://override.test/");
    expect(resolveServices().map((s) => s.key)).toHaveLength(7); // replaces in place, does not append
    delete registry.grok;
  });
});

describe("getItems", () => {
  it("precomputes hrefs", () => {
    document.title = "T";
    const items = getItems({ services: ["claude", "gemini"], input: true, context: false }, "hello there");
    expect(items.map((i) => i.key)).toEqual(["claude", "gemini"]);
    expect(items[0].href).toBe("https://claude.ai/new?q=hello%20there");
    expect(items[0].color).toBe("#D97757");
    expect(items[1].prefill).toBe(false);
  });
});

describe("styles", () => {
  beforeEach(() => document.getElementById("ask-ai-style")?.remove());
  it("injects once", () => {
    injectStyles();
    injectStyles();
    expect(document.querySelectorAll("#ask-ai-style")).toHaveLength(1);
  });
  it("prepends the style element so host stylesheets of equal specificity come later and win", () => {
    const first = document.createElement("meta");
    document.head.prepend(first);
    injectStyles();
    expect(document.head.firstElementChild!.id).toBe("ask-ai-style");
    first.remove();
  });
  it("keeps the specificity invariants: base <= (0,2,0), state <= (0,3,0), unless var-only; no !important", () => {
    expect(checkCss(css)).toEqual([]);
  });
  it("the checker itself flags violations", () => {
    expect(checkCss(".a .b .c{color:red}")).toHaveLength(1);
    expect(checkCss("a.b:hover.c{color:red}")).toHaveLength(1);
    expect(checkCss(".a{color:red!important}")).toHaveLength(1);
    expect(checkCss("#x{color:red}")).toHaveLength(1);
    expect(checkCss(".a .b .c{--_x:1}")).toEqual([]); // custom properties only
    expect(checkCss(".a[data-x=y]{color:red}")).toEqual([]);
    expect(checkCss(".a:hover{color:red}")).toEqual([]);
    expect(checkCss(".a[data-x=y]:hover{color:red}")).toEqual([]); // state rules may reach (0,3,0)
    expect(checkCss(".a .b:hover{color:red}")).toEqual([]);
    expect(checkCss(".a[data-x=y] .b:hover:focus-visible{color:red}")).toHaveLength(1);
    expect(checkCss(".a .b[data-x=y]{color:red}")).toHaveLength(1); // a base rule stays <= (0,2,0)
    expect(checkCss("@media (min-width:1px){.a{color:red}}")).toEqual([]);
    expect(specificity(":where(.a .b) .c")).toEqual([0, 1, 0]);
    expect(specificity('.a[data-x="y z"] svg::after')).toEqual([0, 2, 2]);
  });
  it("never declares a public --aai-* property: users set them anywhere, presets use private --_x ones", () => {
    expect(css).not.toMatch(/--aai-[\w-]+\s*:/);
    expect(css).toMatch(/var\(--aai-bg,var\(--_b\)\)/);
  });
  it("has no :where() wrappers on structural rules", () => {
    expect(css).not.toContain(":where(");
  });
});

describe("page override", () => {
  const url = "https://example.com/docs/api";
  it("overrides detected values in getContext", () => {
    document.title = "Detected";
    const c = getContext({ page: { url, title: " Server title ", description: "Desc" } });
    expect(c).toMatchObject({ url, title: "Server title", description: "Desc" });
  });
  it("falls back to the detected value per field", () => {
    document.title = "Detected";
    const c = getContext({ page: { url } });
    expect(c.url).toBe(url);
    expect(c.title).toBe("Detected");
  });
  it("makes hrefs independent of the document (SSR parity)", () => {
    const opts = { services: ["claude"], page: { url, title: "API" } };
    document.title = "Other";
    const href = getItems(opts)[0].href;
    expect(decodeURIComponent(href)).toContain(`Context: API — ${url}`);
    document.title = "Changed again";
    expect(getItems(opts)[0].href).toBe(href);
  });
  it("is the base for relative references", () => {
    const p = decodeURIComponent(getItems({ services: ["claude"], references: ["/llms.txt"], page: { url } })[0].href);
    expect(p).toContain("- https://example.com/llms.txt");
  });
  it("is available as {url}/{title}/{description} in templates", () => {
    const [it] = getItems({ services: ["claude"], prompt: "{title}|{url}|{description}", context: false, page: { url, title: "T", description: "D" } });
    expect(decodeURIComponent(it.href.split("q=")[1])).toBe(`T|${url}|D`);
  });
});
