import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement as h, createRef, useState, act } from "react";
import { renderToString } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { AskAI } from "../src/react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement, root: Root, open: ReturnType<typeof vi.fn>;
beforeEach(() => {
  document.body.innerHTML = '<div id="h"></div>';
  document.title = "Doc";
  host = document.getElementById("h")!;
  root = createRoot(host);
  open = vi.fn();
  window.open = open as any;
});
afterEach(() => act(() => root.unmount()));

const render = (el: any) => act(() => root.render(el));
const click = (el: Element, init: MouseEventInit = {}) =>
  act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init })); });
const q = (u: string) => decodeURIComponent(u.split("q=")[1]);

describe("SSR", () => {
  it("renders anchors with hrefs and the shared markup", () => {
    const html = renderToString(h(AskAI, { services: ["claude", "gemini"], label: "Ask AI", className: "x", variant: "brand", id: "a", style: { margin: 1 } }));
    expect(html).toContain('class="aai x"');
    expect(html).toContain('data-variant="brand"');
    expect(html).toContain('id="a"');
    expect(html).toContain('class="aai__label"');
    expect(html).toMatch(/<a class="aai__btn aai__btn--claude"[^>]*href="https:\/\/claude\.ai\/new\?q=/);
    expect(html).toContain("--aai-brand:#D97757");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="Ask Gemini"');
    expect(html).toContain('role="status"');
  });
  it("renders the built-in input", () => {
    const html = renderToString(h(AskAI, { services: ["claude"], input: { placeholder: "Ask", multiline: true }, defaultQuestion: "hi" }));
    expect(html).toContain('<form class="aai__form"');
    expect(html).toMatch(/<textarea[^>]*placeholder="Ask"/);
    expect(html).toMatch(/href="[^"]*hi/);
  });
});

describe("client", () => {
  it("clicks open the service, modifier clicks stay native", async () => {
    const onOpen = vi.fn();
    await render(h(AskAI, { services: ["claude"], onOpen, prompt: "Hello", context: false }));
    const a = host.querySelector<HTMLAnchorElement>(".aai__btn--claude")!;
    const e = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    await act(() => { a.dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledOnce();
    expect(q(open.mock.calls[0][0])).toBe("Hello");
    expect(onOpen).toHaveBeenCalledOnce();
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
      const m = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
      await act(() => { a.dispatchEvent(m); });
      expect(m.defaultPrevented).toBe(false); // left to the browser
    }
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("uses the latest inline function props without memoising", async () => {
    const App = () => {
      const [n, setN] = useState(0);
      return h("div", null,
        h("button", { id: "inc", onClick: () => setN(n + 1) }),
        h(AskAI, { services: ["claude"], context: false, prompt: () => `count ${n}` }));
    };
    await render(h(App));
    await click(host.querySelector("#inc")!);
    await click(host.querySelector("#inc")!);
    await click(host.querySelector(".aai__btn")!);
    expect(q(open.mock.calls[0][0])).toBe("count 2");
  });

  it("refreshes href on hover", async () => {
    await render(h(AskAI, { services: ["claude"], prompt: "p", context: "T={title}" }));
    document.title = "Changed";
    const a = host.querySelector<HTMLAnchorElement>(".aai__btn")!;
    await act(() => { a.dispatchEvent(new Event("pointerover", { bubbles: true })); });
    expect(q(a.getAttribute("href")!)).toContain("T=Changed");
  });

  it("built-in input: uncontrolled, validates, submits and reports changes", async () => {
    const onQuestionChange = vi.fn();
    await render(h(AskAI, { services: ["claude", "grok"], input: true, onQuestionChange, context: false }));
    const input = host.querySelector<HTMLInputElement>(".aai__input")!;
    await click(host.querySelector(".aai__btn")!);
    expect(open).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(() => { setter.call(input, "why?"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(onQuestionChange).toHaveBeenCalledWith("why?");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(q(host.querySelector<HTMLAnchorElement>(".aai__btn--grok")!.href)).toBe("why?");
    await act(() => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0][0]).toContain("claude.ai");
  });

  it("controlled question", async () => {
    await render(h(AskAI, { services: ["claude"], input: true, question: "fixed", context: false, onQuestionChange: () => {} }));
    const a = host.querySelector<HTMLAnchorElement>(".aai__btn")!;
    expect(host.querySelector<HTMLInputElement>(".aai__input")!.value).toBe("fixed");
    await click(a);
    expect(q(open.mock.calls[0][0])).toBe("fixed");
  });

  it("external input via selector, Enter submits to the first service", async () => {
    document.body.insertAdjacentHTML("afterbegin", '<input id="ext">');
    const ext = document.getElementById("ext") as HTMLInputElement;
    ext.value = "outside";
    await render(h(AskAI, { services: ["grok", "claude"], input: "#ext", context: false }));
    expect(host.querySelector(".aai__form")).toBeNull();
    const e = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    ext.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(open.mock.calls[0][0]).toContain("grok.com");
    expect(q(open.mock.calls[0][0])).toBe("outside");
  });

  it("forwards the ref, injects styles once, honours unstyled", async () => {
    const ref = createRef<HTMLDivElement>();
    document.getElementById("ask-ai-style")?.remove();
    await render(h(AskAI, { ref, services: ["claude"], unstyled: true }));
    expect(ref.current).toBe(host.firstElementChild);
    expect(document.getElementById("ask-ai-style")).toBeNull();
    await render(h(AskAI, { ref, services: ["claude"] }));
    expect(document.querySelectorAll("#ask-ai-style")).toHaveLength(1);
  });
});

describe("hint region and fallback glyph", () => {
  it("renders an empty, always-present status region", () => {
    const html = renderToString(h(AskAI, { services: ["claude"] }));
    expect(html).toContain('<div class="aai__hint" role="status" aria-live="polite"></div>');
    expect(html).not.toMatch(/\shidden[=\s>]/);
  });
  it("writes and clears the hint text in place", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    await render(h(AskAI, { services: ["gemini"], context: false }));
    const hint = host.querySelector<HTMLElement>(".aai__hint")!;
    click(host.querySelector(".aai__btn")!);
    expect(host.querySelector(".aai__hint")).toBe(hint);
    expect(hint.textContent).toBe("Prompt copied — paste it into Gemini");
    expect(hint.hasAttribute("hidden")).toBe(false);
    act(() => { vi.advanceTimersByTime(4100); });
    expect(hint.textContent).toBe("");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("uses the whole first character for services without an icon", () => {
    const html = renderToString(h(AskAI, { services: [{ key: "e", label: "😀 Chat", url: "https://e.test/", param: "q" }] }));
    expect(html).toContain('<span class="aai__name">😀</span>');
  });
  it("forwards page and references", () => {
    const html = renderToString(h(AskAI, { services: ["claude"], page: { url: "https://p.test/x", title: "PT" }, references: ["/r"] }));
    const href = decodeURIComponent(html.match(/href="([^"]+)"/)![1].replace(/&amp;/g, "&"));
    expect(href).toContain("Context: PT — https://p.test/x");
    expect(href).toContain("- https://p.test/r");
  });
});
