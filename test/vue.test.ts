import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApp, createSSRApp, h, nextTick, ref } from "vue";
import { renderToString } from "@vue/server-renderer";
import { AskAI, plugin } from "../src/vue";

let host: HTMLElement, open: ReturnType<typeof vi.fn>;
beforeEach(() => {
  document.body.innerHTML = '<div id="h"></div>';
  document.title = "Doc";
  host = document.getElementById("h")!;
  open = vi.fn();
  window.open = open as any;
});
const q = (u: string) => decodeURIComponent(u.split("q=")[1]);
const click = (el: Element, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));

describe("SSR", () => {
  it("renders anchors with hrefs and the shared markup", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(AskAI, { services: ["claude", "gemini"], label: "Ask AI", className: "x", variant: "brand", id: "a" }) }));
    expect(html).toContain('class="aai x"');
    expect(html).toContain('data-variant="brand"');
    expect(html).toContain('id="a"');
    expect(html).toMatch(/<a class="aai__btn aai__btn--claude"[^>]*href="https:\/\/claude\.ai\/new\?q=/);
    expect(html).toContain("--aai-brand:#D97757");
    expect(html).toContain('aria-label="Ask Gemini"');
  });
  it("does not turn absent Boolean-typed props into false", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(AskAI, { services: ["claude"], prompt: "P" }) }));
    expect(html).not.toContain("aai__input"); // input stays off
    expect(decodeURIComponent(html)).toContain("P"); // default context kept (not disabled by Boolean casting)
  });
});

describe("client", () => {
  it("click opens, emits open, modifier click is native", async () => {
    const onOpen = vi.fn();
    createApp({ render: () => h(AskAI, { services: ["claude"], prompt: "Hello", context: false, onOpen }) }).mount(host);
    const a = host.querySelector<HTMLAnchorElement>(".aai__btn--claude")!;
    const e = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    a.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(q(open.mock.calls[0][0])).toBe("Hello");
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ service: "claude" }));
    const m = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
    a.dispatchEvent(m);
    expect(m.defaultPrevented).toBe(false); // left to the browser
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("falls back to default context when context is not passed", () => {
    createApp({ render: () => h(AskAI, { services: ["claude"], prompt: "P" }) }).mount(host);
    click(host.querySelector(".aai__btn")!);
    expect(q(open.mock.calls[0][0])).toBe("P\n\nContext: Doc — " + window.location.href);
  });

  it("supports v-model:question and validates", async () => {
    const question = ref("");
    createApp({
      render: () => h(AskAI, { services: ["claude"], input: true, context: false, question: question.value, "onUpdate:question": (v: string) => (question.value = v) }),
    }).mount(host);
    const input = host.querySelector<HTMLInputElement>(".aai__input")!;
    click(host.querySelector(".aai__btn")!);
    expect(open).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    input.value = "why?";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect(question.value).toBe("why?");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(q(host.querySelector<HTMLAnchorElement>(".aai__btn")!.href)).toBe("why?");
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(q(open.mock.calls[0][0])).toBe("why?");
  });

  it("external input selector: Enter submits", () => {
    document.body.insertAdjacentHTML("afterbegin", '<input id="ext" value="outside">');
    createApp({ render: () => h(AskAI, { services: ["grok"], input: "#ext", context: false }) }).mount(host);
    const e = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    document.getElementById("ext")!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(q(open.mock.calls[0][0])).toBe("outside");
  });

  it("reacts to prop changes and the plugin registers the component", async () => {
    const label = ref("One");
    const app = createApp({ template: "", render: () => h(AskAI, { services: ["claude"], label: label.value }) });
    app.use(plugin);
    expect(app.component("AskAI")).toBe(AskAI);
    app.mount(host);
    expect(host.querySelector(".aai__label")!.textContent).toBe("One");
    label.value = "Two";
    await nextTick();
    expect(host.querySelector(".aai__label")!.textContent).toBe("Two");
  });
});

describe("hint region and fallback glyph", () => {
  it("renders an empty, always-present status region", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(AskAI, { services: ["claude"] }) }));
    expect(html).toContain('<div class="aai__hint" role="status" aria-live="polite"></div>');
    expect(html).not.toMatch(/\shidden[=\s>]/);
  });
  it("writes and clears the hint text in place", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    createApp({ render: () => h(AskAI, { services: ["gemini"], context: false }) }).mount(host);
    const hint = host.querySelector<HTMLElement>(".aai__hint")!;
    click(host.querySelector(".aai__btn")!);
    await nextTick();
    expect(host.querySelector(".aai__hint")).toBe(hint);
    expect(hint.textContent).toBe("Prompt copied — paste it into Gemini");
    vi.advanceTimersByTime(4100);
    expect(hint.textContent).toBe("");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("uses the whole first character for services without an icon", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(AskAI, { services: [{ key: "e", label: "😀 Chat", url: "https://e.test/", param: "q" }] }) }));
    expect(html).toContain('<span class="aai__name">😀</span>');
  });
  it("forwards page and references", async () => {
    const html = await renderToString(createSSRApp({ render: () => h(AskAI, { services: ["claude"], page: { url: "https://p.test/x", title: "PT" }, references: ["/r"] }) }));
    const href = decodeURIComponent(html.match(/href="([^"]+)"/)![1].replace(/&amp;/g, "&"));
    expect(href).toContain("Context: PT — https://p.test/x");
    expect(href).toContain("- https://p.test/r");
  });
});
