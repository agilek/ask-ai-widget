// The dropdown is a lazy chunk: row layouts never load it, menu layouts load it at mount time, early interaction is not lost.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { createSSRApp, h as vh } from "vue";
import { renderToString as vueRender } from "@vue/server-renderer";
import { checkCss, specificity } from "../scripts/css-check.mjs";
import { minifyCss } from "../scripts/css-string.mjs";

let host: HTMLElement;
beforeEach(() => {
  document.head.querySelectorAll("#ask-ai-style, #ask-ai-menu-style").forEach((e) => e.remove());
  document.body.innerHTML = '<div id="h"></div>';
  host = document.getElementById("h")!;
  window.open = vi.fn() as any;
});

/** Fresh module graph: the lazy import cache is module-wide, so every test starts with nothing loaded. */
async function fresh() {
  vi.resetModules();
  const [m, l] = await Promise.all([import("../src"), import("../src/menu-lazy")]);
  return { mount: m.mount, ...l };
}
const trigger = () => host.querySelector<HTMLElement>(".aai__trigger")!;
const menuEl = () => host.querySelector<HTMLElement>(".aai__menu")!;
const isOpen = () => trigger().getAttribute("aria-expanded") === "true" && !menuEl().hasAttribute("hidden");
const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
const flush = () => new Promise((r) => setTimeout(r, 0));
const menuStyle = () => document.getElementById("ask-ai-menu-style");
const o = { services: ["claude", "gemini"], context: false as const };

describe("lazy loading", () => {
  it("row layout never requests the dropdown code or its styles", async () => {
    const { mount, menuRequested, loadMenu } = await fresh();
    mount("#h", o);
    mount("#h", { ...o, variant: "outline" });
    await flush();
    expect(menuRequested()).toBe(false);
    expect(menuStyle()).toBeNull();
    expect(document.getElementById("ask-ai-style")).toBeTruthy();
    void loadMenu; // (only referenced: calling it would start the import)
  });
  it("menu layout starts the import at mount, then injects the menu styles right after the core ones", async () => {
    const { mount, menuRequested, loadMenu } = await fresh();
    mount("#h", { ...o, layout: "menu" });
    expect(menuRequested()).toBe(true); // at mount, not on first click
    expect(menuStyle()).toBeNull(); // not yet: the chunk is still loading
    await loadMenu(); await Promise.resolve();
    expect(menuStyle()).toBeTruthy();
    expect(document.getElementById("ask-ai-style")!.nextElementSibling).toBe(menuStyle());
    expect(menuStyle()!.textContent).toContain("--aai-menu-bg");
    click(trigger());
    expect(isOpen()).toBe(true);
    const pre = menuStyle();
    mount("#h", { ...o, layout: "menu" }); // injected once
    await flush();
    expect(document.querySelectorAll("#ask-ai-menu-style")).toHaveLength(1);
    expect(menuStyle()).toBe(pre);
  });
  it("unstyled skips the menu styles but still binds the behaviour", async () => {
    const { mount, loadMenu } = await fresh();
    mount("#h", { ...o, layout: "menu", unstyled: true });
    await loadMenu(); await Promise.resolve();
    expect(menuStyle()).toBeNull();
    click(trigger());
    expect(isOpen()).toBe(true);
  });
  it("an early click (before the chunk resolved) opens the menu once it is loaded", async () => {
    const { mount, loadMenu } = await fresh();
    mount("#h", { ...o, layout: "menu" });
    click(trigger()); // synchronously after mount: nothing is bound yet
    expect(isOpen()).toBe(false);
    await vi.waitFor(() => expect(isOpen()).toBe(true));
    await loadMenu(); await flush();
    expect(isOpen()).toBe(true); // replayed exactly once (a double replay would have toggled it shut)
    click(trigger()); // the real controller works afterwards
    expect(isOpen()).toBe(false);
  });
  it("an early opening key opens the menu, focuses the first item and is not turned into a native click", async () => {
    const { mount } = await fresh();
    mount("#h", { ...o, layout: "menu" });
    trigger().focus();
    const e = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    trigger().dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(isOpen()).toBe(true));
    expect(document.activeElement).toBe(host.querySelector(".aai__menu .aai__btn"));
  });
  it("two early clicks cancel each other like on a real toggle", async () => {
    const { mount, loadMenu } = await fresh();
    mount("#h", { ...o, layout: "menu" });
    click(trigger()); click(trigger());
    await loadMenu(); await flush();
    expect(isOpen()).toBe(false);
  });
  it("destroy before the chunk resolved binds nothing and injects nothing afterwards", async () => {
    const { mount, loadMenu } = await fresh();
    const inst = mount("#h", { ...o, layout: "menu" })!;
    click(trigger());
    inst.destroy();
    const add = vi.spyOn(host, "addEventListener");
    await loadMenu(); await flush();
    expect(add).not.toHaveBeenCalled();
    expect(menuStyle()).toBeNull();
    expect(host.innerHTML).toBe("");
  });
  it("switching menu -> row unbinds, and a pending load does not bind afterwards", async () => {
    const { mount, loadMenu } = await fresh();
    const inst = mount("#h", { ...o, layout: "menu" })!;
    inst.update({ layout: "row" }); // before the chunk resolved
    const add = vi.spyOn(host, "addEventListener");
    await loadMenu(); await flush();
    expect(add).not.toHaveBeenCalled();
    // bound case: open, then switch to row removes the root and document listeners
    inst.update({ layout: "menu" });
    await loadMenu(); await flush();
    click(trigger());
    expect(isOpen()).toBe(true);
    const rmHost = vi.spyOn(host, "removeEventListener"), rmDoc = vi.spyOn(document, "removeEventListener");
    inst.update({ layout: "row" });
    expect(rmHost.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["click", "keydown", "keyup"]));
    expect(rmDoc.mock.calls.some((c) => c[0] === "pointerdown")).toBe(true);
  });
  it("SSR markup of React and Vue in menu layout needs no chunk and requests none", async () => {
    const { menuRequested } = await fresh();
    const { AskAI } = await import("../src/react");
    const { AskAI: VueAskAI } = await import("../src/vue");
    const html = renderToString(h(AskAI, { ...o, layout: "menu" }));
    expect(html).toContain('class="aai__trigger"');
    expect(html).toMatch(/class="aai__list aai__menu"[^>]*hidden/);
    const v = await vueRender(createSSRApp({ render: () => vh(VueAskAI, { ...o, layout: "menu" }) }));
    expect(v).toContain("aai__trigger");
    expect(menuRequested()).toBe(false);
  });
});

describe("stylesheets", () => {
  const read = (f: string) => minifyCss(readFileSync(f, "utf8"));
  it("core and menu CSS both keep the specificity invariants", async () => {
    expect(checkCss(await read("src/style.css"))).toEqual([]);
    expect(checkCss(await read("src/menu.css"))).toEqual([]);
  });
  it("menu rules live only in menu.css, the core file keeps just the hidden fallback", async () => {
    const core = await read("src/style.css"), menu = await read("src/menu.css");
    for (const m of ["aai__trigger", "aai__menu", "aai__stack", "aai__chevron", "--aai-menu-", ".aai__menu .aai__btn", "data-layout"]) {
      expect(core).not.toContain(m);
      expect(menu).toContain(m);
    }
    expect(core).toContain(".aai__list[hidden]{display:none}"); // no flash of the open panel before the chunk arrives
    expect(menu).not.toMatch(/--aai-[\w-]+\s*:/);
  });
  it("the published style.css is core + menu, style-row.css is core only (after npm run build)", async () => {
    if (!existsSync("style.css")) return;
    const core = await read("src/style.css"), menu = await read("src/menu.css");
    expect(readFileSync("style.css", "utf8").trim()).toBe(core + menu);
    expect(readFileSync("style-row.css", "utf8").trim()).toBe(core);
  });
  it("css-check understands :has() as the specificity of its argument", () => {
    expect(specificity(".aai:has(> .aai__form)")).toEqual([0, 2, 0]);
    expect(checkCss(".aai:has(> .aai__form .aai__input){color:red}")).toHaveLength(1);
    expect(checkCss("@container (max-width:1px){.a .b .c{color:red}}")).toHaveLength(1);
  });
  it("the built-in field follows the variant, shape, size and theme through private variables", async () => {
    const css = await read("src/style.css");
    const rule = (sel: string) => new RegExp(sel.replace(/[[\]().]/g, "\\$&") + "\\{([^}]*)\\}").exec(css)?.[1] ?? "";
    // fill / border / text come from the same private variables as the buttons, public --aai-input-* win
    const input = rule(".aai__form .aai__input");
    expect(input).toContain("background:var(--aai-input-bg,var(--_ib))");
    expect(input).toContain("color:var(--aai-input-fg,var(--_if))");
    expect(input).toContain("border:1px solid var(--aai-border,var(--_ob))");
    expect(input).toContain("min-height:var(--aai-btn-size,var(--_s))");
    expect(input).toContain("border-radius:var(--_ir,var(--aai-radius,var(--_r)))");
    const root = rule(".aai");
    expect(root).toContain("--_ib:var(--aai-bg,var(--_b))"); // the fill follows the variant's button fill
    expect(root).toContain("--_if:var(--aai-fg,var(--_f))");
    // defaults of the private variables differ per variant
    expect(rule(".aai[data-variant=outline]")).toContain("--_b:transparent");
    expect(rule(".aai[data-variant=outline]")).toContain("--_o:var(--aai-line,var(--_l))");
    expect(rule(".aai[data-variant=ghost]")).toContain("--_ob:var(--aai-line,var(--_l))");
    expect(rule(".aai[data-variant=solid]")).toContain("--_b:#111");
    expect(rule(".aai[data-variant=solid]")).toContain("--_ph:rgba(255,255,255,.6)");
    expect(rule(".aai[data-variant=solid][data-theme=dark]")).toContain("--_b:#f2f2f2");
    expect(rule(".aai[data-variant=solid][data-theme=dark]")).toContain("--_ph:rgba(17,17,17,.55)");
    expect(rule(".aai[data-theme=dark]")).toContain("--_b:#2a2a2e");
    expect(rule(".aai[data-size=sm]")).toContain("--_fz:.875");
    expect(rule(".aai[data-size=lg]")).toContain("--_fz:1.125");
    expect(rule(".aai[data-shape=rounded]")).toContain("--_r:10px");
    expect(rule(".aai[data-shape=square]")).toContain("--_r:4px");
    expect(rule(".aai__form textarea.aai__input")).toContain("--_pb:8px");
    expect(rule(".aai__form .aai__input[aria-invalid=true]")).toContain("border-color:#e5484d");
  });
  it("every variant x theme defines text, fill and hover fill as a pair (no light text on a light hover)", async () => {
    const css = await read("src/style.css"), menu = await read("src/menu.css");
    const body = (re: RegExp) => [...css.matchAll(new RegExp(re.source, "g"))].map((m) => m[1]);
    const has = (b: string, ...vars: string[]) => vars.forEach((v) => expect(b, v).toMatch(new RegExp("(^|;)" + v + ":")));
    // solid sets fill, hover fill, text and placeholder together, in light, dark and auto-dark
    const solid = [
      ...body(/\.aai\[data-variant=solid\]\{([^}]*)\}/g),
      ...body(/\.aai\[data-variant=solid\]\[data-theme=dark\]\{([^}]*)\}/g),
      ...body(/\.aai\[data-variant=solid\]\[data-theme=auto\]\{([^}]*)\}/g),
    ];
    expect(solid).toHaveLength(3);
    solid.forEach((b) => has(b, "--_b", "--_h", "--_f", "--_ph"));
    // dark and auto-dark themes carry the same set of values
    const dark = body(/\.aai\[data-theme=dark\]\{([^}]*)\}/g)[0], auto = body(/\.aai\[data-theme=auto\]\{([^}]*)\}/g)[0];
    expect(dark).toBe(auto);
    has(dark, "--_b", "--_h", "--_f", "--_m", "--_l", "--_t", "--_p", "--_q", "--_u");
    // the light defaults exist on the root
    has(body(/\.aai\{([^}]*)\}/g)[0], "--_b", "--_h", "--_f", "--_m", "--_ph", "--_ob", "--_u");
    // outline and ghost are transparent and take their text from the theme, with a tint hover that is not an opaque fill
    for (const v of ["outline", "ghost"]) {
      const b = body(new RegExp("\\.aai\\[data-variant=" + v + "\\]\\{([^}]*)\\}"))[0];
      has(b, "--_b", "--_h");
      expect(b).toContain("--_b:transparent");
      expect(b).toContain("--_h:var(--aai-tint,var(--_t))");
      expect(b).not.toMatch(/--_f:/); // text stays the theme's, never overridden to a fixed light/dark color
    }
    // brand only colors logos: service colors are not text colors
    expect(css).toContain(".aai[data-variant=brand] .aai__btn{--_ik:var(--aai-brand)}");
    // muted text reaches 4.5:1 on white
    expect(css).toMatch(/--_m:#6b6b70/);
    // every state of the field and the buttons reads fg and bg from the same private pair
    expect(css).toContain(".aai__form .aai__input:hover{color:var(--aai-input-fg,var(--_if));background:var(--aai-input-bg,var(--_ih))}");
    expect(css).toMatch(/\.aai__list \.aai__btn:hover\{color:var\(--aai-fg,var\(--_k,var\(--_f\)\)\);background:var\(--aai-bg-hover,var\(--_h\)\)/);
    // every state rule of the buttons, trigger and menu items sets text AND fill
    for (const sheet of [css, menu])
      for (const m of sheet.matchAll(/(\.aai[^{},]*:(?:hover|active))\{([^}]*)\}/g))
        if (/btn|trigger|input/.test(m[1]) && m[2] !== "transform:none") { expect(m[2], m[1]).toMatch(/(^|;)color:/); expect(m[2], m[1]).toMatch(/(^|;)background:/); }
  });
  it("question mode: one row, the buttons always right of the field", async () => {
    const css = await read("src/style.css"), menu = await read("src/menu.css");
    expect(css).toContain(".aai:has(>.aai__form){display:flex;width:100%;container-type:inline-size}");
    expect(css).not.toContain("--_sd"); // no dimmed look: the buttons are normal buttons at all times
    expect(css).not.toContain("placeholder-shown");
    expect(css).toMatch(/\.aai__form\{flex:1 1 0;min-width:0;/);
    expect(css).toMatch(/\.aai__list\{flex:none;/);
    expect(css).toContain("@container (max-width: 440px){.aai__label{flex-basis:100%;white-space:normal}}");
    expect(css).not.toMatch(/\.aai__form\{[^}]*flex-basis:100%/); // the field and the buttons never part
    expect(menu).not.toContain("opacity");
  });
});

describe("built-in field markup", () => {
  it("has no type attribute, so host `input[type=text]` rules cannot match it (mount, React, Vue)", async () => {
    const { mount } = await fresh();
    mount("#h", { ...o, input: true });
    expect(host.querySelector(".aai__input")!.hasAttribute("type")).toBe(false);
    const r = renderToString(h((await import("../src/react")).AskAI, { ...o, input: true }));
    expect(r).toMatch(/<input[^>]*class="aai__input"/);
    expect(r).not.toMatch(/<input[^>]*type=/);
    const VueAskAI = (await import("../src/vue")).AskAI;
    const v = await vueRender(createSSRApp({ render: () => vh(VueAskAI, { ...o, input: true }) }));
    expect(v).not.toMatch(/<input[^>]*type=/);
  });
});

describe.skipIf(!existsSync("dist/index.cjs"))("built files (run npm run build first)", () => {
  it("the CJS entry lazy-loads the menu: require, mount, click, open", async () => {
    const cjs = createRequire(import.meta.url)("../dist/index.cjs");
    cjs.mount("#h", { ...o, layout: "menu" });
    click(trigger());
    await vi.waitFor(() => expect(isOpen()).toBe(true));
    expect(menuStyle()).toBeTruthy();
  });
  it("the CDN file is complete and self-contained: menu code inlined, no import() of another file", async () => {
    const code = readFileSync("dist/ask-ai.min.js", "utf8");
    expect(code).toContain("--aai-menu-bg");
    expect(code).toContain("ask-ai-menu-style");
    expect(code).not.toMatch(/\bimport\s*\(/);
    document.body.innerHTML = '<div id="h" data-ask-ai data-services="claude,gemini" data-layout="menu"></div>';
    host = document.getElementById("h")!;
    new Function(code)();
    click(trigger());
    await vi.waitFor(() => expect(isOpen()).toBe(true));
  });
  it("ESM output has the menu in its own chunk, imported dynamically", () => {
    const chunk = readFileSync("dist/index.js", "utf8") + readdirChunks();
    expect(chunk).toMatch(/import\("\.\/menu-[\w-]+\.js"\)/);
    expect(readFileSync("dist/index.js", "utf8")).not.toContain("--aai-menu-bg");
  });
});

import { readdirSync } from "node:fs";
function readdirChunks(): string {
  return readdirSync("dist").filter((f) => /^chunk-.*\.js$/.test(f)).map((f) => readFileSync("dist/" + f, "utf8")).join("\n");
}
