import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "../src";

let host: HTMLElement;
let open: ReturnType<typeof vi.fn>;
beforeEach(() => {
  document.body.innerHTML = '<div id="h" data-keep="1" class="mine"></div>';
  host = document.getElementById("h")!;
  document.title = "Doc";
  open = vi.fn();
  vi.stubGlobal("open", open);
  window.open = open as any;
});
afterEach(() => vi.unstubAllGlobals());

const click = (el: Element, init: MouseEventInit = {}) => {
  const e = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  el.dispatchEvent(e);
  return e;
};
const btn = (k: string) => host.querySelector<HTMLAnchorElement>(`.aai__btn--${k}`)!;

describe("markup", () => {
  it("renders the contract", () => {
    const inst = mount("#h", { label: "Ask AI about this page", className: "x y" })!;
    expect(inst.element).toBe(host);
    expect(host.className).toBe("mine aai x y");
    expect(host.dataset).toMatchObject({ variant: "soft", shape: "circle", size: "md", theme: "light", keep: "1" });
    expect(host.querySelector(".aai__label")!.textContent).toBe("Ask AI about this page");
    expect(host.querySelector(".aai__form")).toBeNull();
    const list = host.querySelector(".aai__list")!;
    expect(list.getAttribute("role")).toBe("group");
    expect(list.getAttribute("aria-label")).toBe("Ask AI about this page");
    expect(host.querySelectorAll(".aai__btn")).toHaveLength(7);
    const a = btn("claude");
    expect(a.getAttribute("href")).toContain("https://claude.ai/new?q=");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a.getAttribute("aria-label")).toBe("Ask Claude");
    expect(a.getAttribute("title")).toBe("Ask Claude");
    expect(a.getAttribute("style")).toContain("--aai-brand");
    expect(a.querySelector("svg.aai__icon path")!.getAttribute("d")).toBeTruthy();
    expect(a.querySelector(".aai__name")).toBeNull();
    const hint0 = host.querySelector(".aai__hint")!;
    expect(hint0.outerHTML).toBe('<div class="aai__hint" role="status" aria-live="polite"></div>');
    expect(document.getElementById("ask-ai-style")).toBeTruthy();
  });
  it("escapes user strings and falls back to the default aria-label", () => {
    mount("#h", { label: "<b>x</b>" });
    expect(host.querySelector(".aai__label")!.innerHTML).toBe("&lt;b&gt;x&lt;/b&gt;");
    mount("#h", {});
    expect(host.querySelector(".aai__list")!.getAttribute("aria-label")).toBe("Ask AI");
    expect(host.querySelector(".aai__label")).toBeNull();
  });
  it("toggles input / textarea / showLabels / data attrs", () => {
    mount("#h", { input: { placeholder: "Ask…" }, showLabels: true, variant: "brand", shape: "square", size: "lg", theme: "dark", services: ["claude"] });
    const i = host.querySelector<HTMLInputElement>("input.aai__input")!;
    expect(i.getAttribute("placeholder")).toBe("Ask…");
    expect(i.getAttribute("aria-label")).toBe("Your question");
    expect(btn("claude").querySelector(".aai__name")!.textContent).toBe("Claude");
    expect(host.dataset).toMatchObject({ variant: "brand", shape: "square", size: "lg", theme: "dark" });
    mount("#h", { input: { multiline: true } });
    expect(host.querySelector("textarea.aai__input")).toBeTruthy();
  });
  it("uses first letter for services without icon", () => {
    mount("#h", { services: [{ key: "zed", label: "Zed", url: "https://z.test/", param: "q" }] });
    expect(btn("zed").querySelector("svg")).toBeNull();
    expect(btn("zed").textContent).toBe("Z");
  });
  it("returns null for a missing target and skips styles when unstyled", () => {
    expect(mount("#nope")).toBeNull();
    document.getElementById("ask-ai-style")?.remove();
    mount("#h", { unstyled: true });
    expect(document.getElementById("ask-ai-style")).toBeNull();
  });
});

describe("clicking", () => {
  it("opens the service in a new tab", () => {
    mount("#h", { context: false });
    const e = click(btn("claude"));
    expect(e.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledWith("https://claude.ai/new?q=Explain%20this%20page.", "_blank", "noopener,noreferrer");
  });
  it("lets modifier / non-left clicks fall through", () => {
    mount("#h");
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
      expect(click(btn("claude"), init).defaultPrevented).toBe(false);
    }
    expect(open).not.toHaveBeenCalled();
  });
  it("clicks on the icon bubble to the button", () => {
    mount("#h", { context: false });
    click(btn("grok").querySelector("path")!);
    expect(open.mock.calls[0][0]).toContain("https://grok.com/?q=");
  });
  it("fires onOpen and ask-ai:open", () => {
    const onOpen = vi.fn();
    const ev = vi.fn();
    document.body.addEventListener("ask-ai:open", ev);
    mount("#h", { onOpen, context: false });
    click(btn("perplexity"));
    const d = { service: "perplexity", prompt: "Explain this page.", url: "https://www.perplexity.ai/search?q=Explain%20this%20page." };
    expect(onOpen).toHaveBeenCalledWith(d);
    expect((ev.mock.calls[0][0] as CustomEvent).detail).toEqual(d);
    document.body.removeEventListener("ask-ai:open", ev);
  });
  it("refreshes href on hover / focus with the current question", () => {
    mount("#h", { input: true, context: false });
    host.querySelector<HTMLInputElement>(".aai__input")!.value = "fresh q";
    btn("claude").dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(btn("claude").getAttribute("href")).toBe("https://claude.ai/new?q=fresh%20q");
    host.querySelector<HTMLInputElement>(".aai__input")!.value = "again";
    btn("claude").dispatchEvent(new Event("focusin", { bubbles: true }));
    expect(btn("claude").getAttribute("href")).toBe("https://claude.ai/new?q=again");
  });
});

describe("input mode", () => {
  it("blocks empty required questions and flags aria-invalid", () => {
    mount("#h", { input: true });
    const i = host.querySelector<HTMLInputElement>(".aai__input")!;
    click(btn("claude"));
    expect(open).not.toHaveBeenCalled();
    expect(i.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(i);
    i.value = "x";
    i.dispatchEvent(new Event("input", { bubbles: true }));
    expect(i.hasAttribute("aria-invalid")).toBe(false);
  });
  it("allows empty when required:false", () => {
    mount("#h", { input: { required: false } });
    click(btn("claude"));
    expect(open).toHaveBeenCalledOnce();
  });
  it("submit opens submitService (or first)", () => {
    const a = mount("#h", { input: true, submitService: "grok", context: false })!;
    host.querySelector<HTMLInputElement>(".aai__input")!.value = "hey";
    host.querySelector(".aai__form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(open.mock.calls[0][0]).toBe("https://grok.com/?q=hey");
    a.destroy();
    mount("#h", { input: true, context: false });
    host.querySelector<HTMLInputElement>(".aai__input")!.value = "hey";
    host.querySelector(".aai__form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(open.mock.calls[1][0]).toBe("https://chatgpt.com/?q=hey");
  });
  it("binds an external input element and selector", () => {
    const ext = document.createElement("input");
    ext.id = "ext";
    document.body.append(ext);
    for (const input of [ext, "#ext"]) {
      open.mockClear();
      const inst = mount("#h", { input, context: false, submitService: "claude" })!;
      expect(host.querySelector(".aai__form")).toBeNull();
      click(btn("claude"));
      expect(ext.getAttribute("aria-invalid")).toBe("true");
      expect(open).not.toHaveBeenCalled();
      ext.value = "outside";
      ext.dispatchEvent(new Event("input"));
      expect(ext.hasAttribute("aria-invalid")).toBe(false);
      ext.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
      expect(open.mock.calls[0][0]).toBe("https://claude.ai/new?q=outside");
      inst.destroy();
      ext.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      expect(open).toHaveBeenCalledOnce();
      ext.value = "";
    }
  });
});

describe("gemini (no prefill)", () => {
  it("copies the prompt and shows the hint", () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mount("#h", { context: false });
    click(btn("gemini"));
    expect(writeText).toHaveBeenCalledWith("Explain this page.");
    const hint = host.querySelector<HTMLElement>(".aai__hint")!;
    expect(hint.hasAttribute("hidden")).toBe(false);
    expect(hint.textContent).toBe("Prompt copied — paste it into Gemini");
    expect(open).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(4100);
    expect(hint.textContent).toBe("");
    expect(hint.hasAttribute("hidden")).toBe(false);
    vi.useRealTimers();
  });
  it("deepseek copies like gemini", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mount("#h", { context: false });
    click(btn("deepseek"));
    expect(writeText).toHaveBeenCalledWith("Explain this page.");
    expect(host.querySelector(".aai__hint")!.textContent).toBe("Prompt copied — paste it into DeepSeek");
    expect(open.mock.calls[0][0]).toContain("https://chat.deepseek.com/?q=");
  });
  it("mistral does not copy", () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mount("#h", { context: false });
    click(btn("mistral"));
    expect(writeText).not.toHaveBeenCalled();
  });
  it("survives a rejecting clipboard", () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(new Error("no")) } });
    mount("#h");
    click(btn("gemini"));
    expect(open).toHaveBeenCalledOnce();
  });
});

describe("update / destroy", () => {
  it("update merges options and re-renders, keeping the typed question", () => {
    const inst = mount("#h", { input: true, services: ["claude"] })!;
    host.querySelector<HTMLInputElement>(".aai__input")!.value = "keep me";
    inst.update({ label: "New", variant: "outline", className: "z", services: ["claude", "grok"] });
    expect(host.querySelector(".aai__label")!.textContent).toBe("New");
    expect(host.dataset.variant).toBe("outline");
    expect(host.className).toBe("mine aai z");
    expect(host.querySelectorAll(".aai__btn")).toHaveLength(2);
    expect(host.querySelector<HTMLInputElement>(".aai__input")!.value).toBe("keep me");
  });
  it("destroy removes content, listeners, classes and attributes", () => {
    const inst = mount("#h", { className: "z" })!;
    const btnEl = btn("claude");
    inst.destroy();
    expect(host.innerHTML).toBe("");
    expect(host.className).toBe("mine");
    expect(host.getAttribute("data-keep")).toBe("1");
    expect(host.hasAttribute("data-variant")).toBe(false);
    click(btnEl);
    expect(open).not.toHaveBeenCalled();
  });
});

describe("remounting", () => {
  it("mounting the same element twice replaces the first instance (no stacked listeners)", () => {
    const onOpen1 = vi.fn(), onOpen2 = vi.fn();
    mount("#h", { onOpen: onOpen1, context: false });
    const second = mount("#h", { onOpen: onOpen2, context: false })!;
    click(btn("claude"));
    expect(onOpen1).not.toHaveBeenCalled();
    expect(onOpen2).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledOnce();
    second.destroy();
    expect(host.className).toBe("mine");
    expect(host.getAttribute("data-keep")).toBe("1");
    expect(host.hasAttribute("data-variant")).toBe(false);
  });
  it("remounting unbinds the previous external input listener", () => {
    const ext = document.createElement("input");
    document.body.append(ext);
    mount("#h", { input: ext, context: false, submitService: "claude" });
    mount("#h", { input: ext, context: false, submitService: "claude" });
    ext.value = "q";
    ext.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    expect(open).toHaveBeenCalledOnce();
  });
  it("update() after destroy() is a no-op and destroy() is idempotent", () => {
    const inst = mount("#h")!;
    inst.destroy();
    inst.update({ label: "x" });
    inst.destroy();
    expect(host.innerHTML).toBe("");
  });
});

describe("robustness", () => {
  it("tolerates extra whitespace in className", () => {
    expect(() => mount("#h", { className: "  a   b\n c " })).not.toThrow();
    expect(host.classList.contains("a") && host.classList.contains("b") && host.classList.contains("c")).toBe(true);
  });
  it("uses the first whole character of a label as the fallback glyph", () => {
    mount("#h", { services: [{ key: "e", label: "😀 Emoji", url: "https://e.test/", param: "q" }] });
    expect(btn("e").textContent).toBe("😀");
  });
});

describe("{selection}", () => {
  const sel = (text: string) => vi.stubGlobal("getSelection", () => ({ toString: () => text }));
  it("uses the selection captured on pointerdown even if the click cleared it", () => {
    sel("picked text");
    mount("#h", { prompt: "About: {selection}", context: false, services: ["claude"] });
    btn("claude").dispatchEvent(new Event("pointerdown", { bubbles: true }));
    sel(""); // the press cleared the selection
    btn("claude").dispatchEvent(new Event("focusin", { bubbles: true })); // mouse focus right after pointerdown: must not wipe it
    click(btn("claude"));
    expect(open.mock.calls[0][0]).toBe("https://claude.ai/new?q=About%3A%20picked%20text");
  });
  it("a later press with no selection resets the captured value", () => {
    sel("old");
    mount("#h", { prompt: "S:{selection}", context: false, services: ["claude"] });
    btn("claude").dispatchEvent(new Event("pointerdown", { bubbles: true }));
    sel("");
    vi.useFakeTimers();
    vi.advanceTimersByTime(1000);
    btn("claude").dispatchEvent(new Event("pointerdown", { bubbles: true }));
    vi.useRealTimers();
    click(btn("claude"));
    expect(open.mock.calls[0][0]).toBe("https://claude.ai/new?q=S%3A");
  });
});

describe("hint region", () => {
  it("is present and empty when idle, filled and cleared by text only", () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    mount("#h", { context: false });
    const hint = host.querySelector<HTMLElement>(".aai__hint")!;
    expect(hint.getAttribute("role")).toBe("status");
    expect(hint.getAttribute("aria-live")).toBe("polite");
    expect(hint.textContent).toBe("");
    click(btn("gemini"));
    expect(hint.textContent).toBe("Prompt copied — paste it into Gemini");
    click(btn("deepseek"));
    vi.advanceTimersByTime(3000);
    expect(hint.textContent).toBe("Prompt copied — paste it into DeepSeek"); // timer restarted
    vi.advanceTimersByTime(1100);
    expect(hint.textContent).toBe("");
    expect(hint.hasAttribute("hidden")).toBe(false);
    vi.useRealTimers();
  });
  it("collapses via :empty in the stylesheet", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/style.css", "utf8");
    expect(css.replace(/\s+/g, "")).toContain(".aai__hint:empty{display:none}");
  });
  it("uses the whole first character for services without an icon", () => {
    mount("#h", { services: [{ key: "e", label: "😀 Chat", url: "https://e.test/", param: "q" }] });
    expect(host.querySelector(".aai__name")!.textContent).toBe("😀");
  });
});
