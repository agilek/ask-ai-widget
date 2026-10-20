import { describe, it, expect, vi, beforeEach } from "vitest";
import "../src/element";
import { AskAIElement, defineAskAI, parseAttrs } from "../src/element";

const tick = () => Promise.resolve();
const make = (html: string) => {
  document.body.innerHTML = html;
  return document.body.firstElementChild as AskAIElement;
};
let open: ReturnType<typeof vi.fn>;
beforeEach(() => {
  document.body.innerHTML = "";
  document.title = "Doc";
  open = vi.fn();
  window.open = open as any;
});

describe("define", () => {
  it("auto-defines ask-ai and is idempotent", () => {
    expect(customElements.get("ask-ai")).toBe(AskAIElement);
    expect(() => defineAskAI()).not.toThrow();
  });
});

describe("parseAttrs", () => {
  const el = (attrs: Record<string, string>) => {
    const d = document.createElement("div");
    for (const k in attrs) d.setAttribute(k, attrs[k]);
    return d;
  };
  it("maps kebab-case attributes", () => {
    expect(parseAttrs(el({
      services: "claude, chatgpt,", prompt: "p", label: "L", "show-labels": "", unstyled: "false",
      "max-length": "100", "submit-service": "claude", "class-name": "x", vars: '{"a":"1"}', context: "none",
    }))).toEqual({
      services: ["claude", "chatgpt"], prompt: "p", label: "L", showLabels: true, unstyled: false,
      maxLength: 100, submitService: "claude", className: "x", vars: { a: "1" }, context: false,
    });
  });
  it("handles input forms", () => {
    expect(parseAttrs(el({ input: "" })).input).toBe(true);
    expect(parseAttrs(el({ input: "false" })).input).toBeUndefined();
    expect(parseAttrs(el({ input: "#q" })).input).toBe("#q");
    expect(parseAttrs(el({ input: ".q" })).input).toBe(".q");
    expect(parseAttrs(el({ input: "", placeholder: "Ask", required: "false", multiline: "" })).input)
      .toEqual({ placeholder: "Ask", required: false, multiline: true });
  });
  it("ignores bad JSON and supports a prefix", () => {
    expect(parseAttrs(el({ vars: "{nope" })).vars).toBeUndefined();
    expect(parseAttrs(el({ "data-label": "X", label: "no" }), "data-").label).toBe("X");
  });
});

describe("<ask-ai>", () => {
  it("renders from attributes", () => {
    const e = make('<ask-ai services="claude,chatgpt" label="Ask AI" variant="outline" show-labels></ask-ai>');
    expect(e.classList.contains("aai")).toBe(true);
    expect(e.dataset.variant).toBe("outline");
    expect(e.querySelectorAll(".aai__btn")).toHaveLength(2);
    expect(e.querySelector(".aai__label")!.textContent).toBe("Ask AI");
    expect(e.querySelector(".aai__btn--claude .aai__name")!.textContent).toBe("Claude");
  });

  it("context=none drops the context", () => {
    const e = make('<ask-ai services="claude" prompt="Hi" context="none"></ask-ai>');
    const href = e.querySelector<HTMLAnchorElement>(".aai__btn")!.href;
    expect(decodeURIComponent(href.split("q=")[1])).toBe("Hi");
  });

  it("property functions win over attributes and fire open", async () => {
    const e = make('<ask-ai services="claude" prompt="attr"></ask-ai>');
    const onOpen = vi.fn(), seen = vi.fn();
    e.addEventListener("ask-ai:open", seen);
    e.context = false;
    e.prompt = (c) => `fn:${c.service}`;
    e.onOpen = onOpen;
    await tick();
    const a = e.querySelector<HTMLAnchorElement>(".aai__btn")!;
    expect(decodeURIComponent(a.href.split("q=")[1])).toBe("fn:claude");
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(open).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(seen).toHaveBeenCalledOnce();
    e.prompt = undefined; // falls back to the attribute
    await tick();
    expect(decodeURIComponent(e.querySelector<HTMLAnchorElement>(".aai__btn")!.href.split("q=")[1])).toBe("attr");
  });

  it("options sets many properties", async () => {
    const e = make('<ask-ai></ask-ai>');
    e.options = { services: ["grok"], label: "Hey", size: "lg" };
    await tick();
    expect(e.querySelectorAll(".aai__btn")).toHaveLength(1);
    expect(e.dataset.size).toBe("lg");
    expect(e.options.label).toBe("Hey");
  });

  it("batches updates into one render", async () => {
    const e = make('<ask-ai services="claude"></ask-ai>');
    const prompt = vi.fn(() => "x");
    e.prompt = prompt;
    await tick();
    prompt.mockClear();
    e.label = "a"; e.variant = "solid"; e.shape = "square"; e.size = "sm"; e.theme = "dark";
    e.setAttribute("template", "{prompt}");
    expect(prompt).not.toHaveBeenCalled();
    await tick();
    expect(prompt).toHaveBeenCalledTimes(1); // one render, one service
    expect(e.dataset).toMatchObject({ variant: "solid", shape: "square", size: "sm", theme: "dark" });
  });

  it("re-renders when an attribute changes and resets removed ones", async () => {
    const e = make('<ask-ai services="claude" label="One"></ask-ai>');
    e.setAttribute("label", "Two");
    await tick();
    expect(e.querySelector(".aai__label")!.textContent).toBe("Two");
    e.removeAttribute("label");
    await tick();
    expect(e.querySelector(".aai__label")).toBeNull();
  });

  it("built-in input vs selector", async () => {
    const e = make("<ask-ai input placeholder='Ask'></ask-ai>");
    expect(e.querySelector("input.aai__input")!.getAttribute("placeholder")).toBe("Ask");
    document.body.innerHTML = '<input id="q"><ask-ai services="claude" input="#q"></ask-ai>';
    const e2 = document.querySelector("ask-ai")!;
    expect(e2.querySelector(".aai__form")).toBeNull();
    const q = document.getElementById("q") as HTMLInputElement;
    q.value = "why";
    const a = e2.querySelector<HTMLAnchorElement>(".aai__btn")!;
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(decodeURIComponent(open.mock.calls[0][0].split("q=")[1])).toContain("why");
  });

  it("cleans up on disconnect and remounts on reconnect", async () => {
    const e = make('<ask-ai services="claude" class-name="mine"></ask-ai>');
    expect(e.classList.contains("mine")).toBe(true);
    e.remove();
    expect(e.querySelector(".aai__btn")).toBeNull();
    expect(e.classList.contains("aai")).toBe(false);
    document.body.append(e);
    expect(e.querySelectorAll(".aai__btn")).toHaveLength(1);
    e.remove();
    e.label = "late"; // no render while disconnected, no throw
    await tick();
    expect(e.querySelector(".aai__label")).toBeNull();
  });
});
