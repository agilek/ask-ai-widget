// Real-browser state matrix (clean page, and a hostile host page with common resets): every variant x theme x layout x input x page background, in every interaction state,
// with computed (cascaded) colors. Text vs its effective background must reach 4.5:1, the placeholder 3:1, icons 3:1.
// Brand-colored icons are a design choice: failing below 2:1, warning below 3:1. Needs playwright-core and a Chromium:
//   npm run build && npm run check:contrast [-- --sheet=/path/to/states-matrix.png] [-- --quick]
// The hostile pass also compares computed styles with the clean pass, so host CSS cannot leak into the widget.
// CHROMIUM_PATH points at a browser binary; otherwise Playwright's default Chromium is used (npx playwright install chromium).
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const args = process.argv.slice(2);
const sheetPath = args.find((a) => a.startsWith("--sheet="))?.slice(8);
const quick = args.includes("--quick"); // light scheme only, fewer combinations (local iteration)
const BG = { white: "#ffffff", dark: "#111113" };
const SERVICES = ["chatgpt", "claude", "gemini"];

const tmp = mkdtempSync(join(tmpdir(), "ask-ai-contrast-"));
// Common reset / typography rules of real sites (WordPress themes, Tailwind typography, Bootstrap reboot) that bleed into widgets.
const HOST_CSS = `a{color:#00e;text-decoration:underline} a:visited{color:#551a8b} a:hover{color:#e00;background:#ff0}
.prose a, main a{color:#0a0;border-bottom:2px solid}
input[type=text],input,textarea{background:#111;color:#fff;border:3px solid red;padding:20px;box-shadow:0 0 0 4px pink;height:60px}
input:hover,input[type=text]:hover{background:#fff} input:focus{outline:5px solid lime}
button{background:#ff0;color:#000;border:2px solid;padding:12px} button:hover{background:#fff;color:#fff}
svg{width:100%;height:auto} img,svg{display:block} *{box-sizing:content-box}`;
const page$ = (hostile) => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0}
#w{--aai-transition:0s}
#stage{position:absolute;left:0;top:0;width:560px;height:260px;padding:20px;box-sizing:border-box}
${hostile ? HOST_CSS : ""}</style>
<${hostile ? "main class=\"prose\"" : "div"}><div id="stage"><div id="w"></div></div></${hostile ? "main" : "div"}><script src="file://${process.env.ASK_AI_JS || root + "/dist/ask-ai.min.js"}"></script>
<script>window.open=()=>null</script>`;
writeFileSync(join(tmp, "clean.html"), page$(false));
writeFileSync(join(tmp, "hostile.html"), page$(true));

/** Runs in the page: the computed style of `scope` that a host page could change (and of its first icon). */
function signature({ scope, nth }) {
  const el = document.querySelectorAll(scope)[nth], cs = getComputedStyle(el);
  const pick = (c, keys) => Object.fromEntries(keys.map((k) => [k, c[k]]));
  const out = pick(cs, ["color", "backgroundColor", "borderTopWidth", "borderBottomWidth", "borderBottomColor", "textDecorationLine", "boxShadow", "paddingLeft", "paddingTop", "outlineStyle", "outlineWidth", "display"]);
  out.height = Math.round(el.getBoundingClientRect().height);
  const ic = el.querySelector("svg");
  if (ic) Object.assign(out, { iconW: getComputedStyle(ic).width, iconH: getComputedStyle(ic).height, iconDisplay: getComputedStyle(ic).display, iconFill: getComputedStyle(ic).fill });
  return out;
}

/** Runs in the page: contrast records for the text, placeholder and icons inside `scope`. */
function measure({ scope, nth }) {
  const scopeEl = document.querySelectorAll(scope)[nth], rootEl = document.getElementById("w");
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (f, b) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3]));
  const lum = (c) => { const l = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => {
    const chain = [];
    for (let e = el; e; e = e.parentElement) chain.push(e);
    let base = [255, 255, 255], owned = false, stop = chain.length;
    for (let i = 0; i < chain.length; i++) {
      const c = parse(getComputedStyle(chain[i]).backgroundColor);
      if (c && c[3] >= 0.99) { base = c.slice(0, 3); owned = rootEl.contains(chain[i]); stop = i; break; }
    }
    for (let i = stop - 1; i >= 0; i--) { const c = parse(getComputedStyle(chain[i]).backgroundColor); if (c && c[3] > 0) base = over(c, base); }
    return { bg: base, owned };
  };
  const out = [];
  const sel = ".aai__label, .aai__input, .aai__name, .aai__icon, .aai__chevron, .aai__trigger-label";
  const els = [...scopeEl.querySelectorAll(sel)];
  if (scopeEl.matches(sel)) els.push(scopeEl);
  for (const el of els) {
    if (!el.getClientRects().length) continue;
    const { bg, owned } = bgOf(el), cs = getComputedStyle(el);
    const svc = el.closest("[data-service]")?.dataset.service || (el.closest(".aai__stack-item") ? "stack" : "");
    const where = el.closest(".aai__menu") ? "menu " : "";
    const name = where + (el.className.baseVal ?? el.className).split(" ")[0] + (svc ? "[" + svc + "]" : "");
    const rec = (kind, fg) => { const f = parse(fg); out.push({ name, kind, ratio: ratio(over(f, bg), bg), fg, bg: `rgb(${bg.map(Math.round)})`, owned }); };
    if (el.matches(".aai__input")) {
      if (el.value) rec("text", cs.color);
      else rec("placeholder", getComputedStyle(el, "::placeholder").color);
    } else if (el.matches(".aai__icon, .aai__chevron")) rec("icon", cs.color);
    else rec("text", cs.color);
  }
  return out;
}

const combos = [];
for (const variant of ["soft", "outline", "solid", "ghost", "brand"])
  for (const theme of ["light", "dark", "auto"])
    for (const layout of ["row", "menu"])
      for (const input of [false, true])
        for (const bg of ["white", "dark"]) combos.push({ variant, theme, layout, input, bg });

const failures = [], warnings = [];
const sigs = new Map(); // computed styles per state, to compare the hostile pass with the clean one
let checks = 0;
const sheet = []; // { combo, shots: [[label, base64]] }

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const runPass = async (scheme, mode) => {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 600, height: 300 } });
    const page = await ctx.newPage();
    await page.goto("file://" + join(tmp, mode + ".html"));
    for (const c of combos) {
      const effective = c.theme === "auto" ? scheme : c.theme;
      const matched = (effective === "dark") === (c.bg === "dark");
      if (!matched && (c.variant === "outline" || c.variant === "ghost")) continue; // transparent: text sits on the page, mismatch is the host's choice
      if (quick && c.theme === "auto") continue;
      const tag = `${mode === "hostile" ? "HOST " : ""}${c.variant}/${c.theme}${c.theme === "auto" ? "(" + scheme + ")" : ""}/${c.layout}/${c.input ? "input" : "no-input"}/page:${c.bg}`;
      const shots = [];
      const mount = async () => {
        await page.evaluate(({ c, SERVICES, bg }) => {
          document.getElementById("stage").style.background = bg;
          const w = document.getElementById("w");
          w.className = ""; w.removeAttribute("style"); w.removeAttribute("data-variant");
          window.AskAI.mount(w, { services: SERVICES, variant: c.variant, theme: c.theme, layout: c.layout, label: "Ask AI", showLabels: !c.input && c.layout === "row", input: c.input ? { placeholder: "Ask a question" } : false, context: false });
        }, { c, SERVICES, bg: BG[c.bg] });
        await page.mouse.move(590, 290);
        await page.evaluate(() => document.activeElement?.blur());
        await page.waitForTimeout(0);
        await settle();
      };
      const settle = () => page.evaluate(() => new Promise((r) => setTimeout(r, 15))); // transitions are off (--aai-transition: 0s)
      const check = async (state, scope, nth = 0) => {
        if (scope !== "#w") sigs.set([mode, scheme, tag.replace(/^HOST /, ""), state, nth].join("|"), { mode, tag, state, sig: await page.evaluate(signature, { scope, nth }) });
        const recs = await page.evaluate(measure, { scope, nth });
        for (const r of recs) {
          if (!r.owned && !matched) continue;
          checks++;
          const brandIcon = c.variant === "brand" && r.kind === "icon" && !/chevron/.test(r.name);
          const need = r.kind === "text" ? 4.5 : 3;
          const hard = brandIcon ? 2 : need;
          const entry = { tag, state, element: r.name, kind: r.kind, ratio: +r.ratio.toFixed(2), need: hard, fg: r.fg, bg: r.bg };
          if (r.ratio < hard) failures.push(entry);
          else if (brandIcon && r.ratio < 3) warnings.push(entry);
        }
      };
      const snap = async (label) => { if (sheetPath) shots.push([label, (await page.locator("#stage").screenshot()).toString("base64")]); };
      const tab = async (n) => { await page.evaluate(() => document.activeElement?.blur()); for (let i = 0; i < n; i++) await page.keyboard.press("Tab"); await page.mouse.move(590, 290); await settle(); };
      const state = async (label, scope, nth) => { await settle(); await check(label, scope, nth); await snap(label); };

      await mount();
      await state("rest", "#w");
      if (c.input) {
        await page.hover(".aai__input"); await state("input hover", ".aai__input");
        await page.click(".aai__input"); await page.mouse.move(590, 290); await state("input focus", ".aai__input");
        await page.keyboard.type("Hello world"); await state("input typed", ".aai__input");
        await page.hover(".aai__input"); await state("input typed+hover", ".aai__input");
        await mount();
        // empty required field: activating a service sets aria-invalid and focuses the field
        if (c.layout === "row") await page.click(".aai__btn");
        else { await page.click(".aai__trigger"); await page.click(".aai__menu .aai__btn"); }
        await page.mouse.move(590, 290);
        await state("input aria-invalid", ".aai__input");
        await mount();
      }
      if (c.layout === "row") {
        const n = SERVICES.length, offset = c.input ? 1 : 0;
        for (let i = 0; i < n; i++) {
          await page.hover(`.aai__btn >> nth=${i}`); await state(`button ${i} hover`, ".aai__btn", i);
          await tab(offset + i + 1); await state(`button ${i} focus-visible`, ".aai__btn", i);
          await page.hover(`.aai__btn >> nth=${i}`); await page.mouse.down(); await page.mouse.move(590, 290);
          await state(`button ${i} active`, ".aai__btn", i); await page.mouse.up();
        }
      } else {
        await page.hover(".aai__trigger"); await state("trigger hover", ".aai__trigger");
        await page.mouse.move(590, 290);
        await page.click(".aai__trigger"); await page.mouse.move(590, 290);
        await state("trigger expanded + menu", ".aai__trigger"); await check("menu open", ".aai__menu"); await snap("menu open");
        await page.hover(".aai__menu .aai__btn >> nth=1"); await state("menu item hover", ".aai__menu .aai__btn", 1);
        await page.mouse.move(590, 290);
        await mount();
        await tab((c.input ? 1 : 0) + 1); await page.keyboard.press("ArrowDown"); await page.mouse.move(590, 290);
        await state("menu item focus", ".aai__menu .aai__btn", 0); await state("trigger (menu open by key)", ".aai__trigger");
        await page.hover(".aai__menu .aai__btn >> nth=2"); await page.mouse.down(); await page.mouse.move(590, 290);
        await state("menu item active", ".aai__menu .aai__btn", 2); await page.mouse.up();
        await mount();
        await tab((c.input ? 1 : 0) + 1);
        await state("trigger focus-visible", ".aai__trigger");
        await page.hover(".aai__trigger"); await page.mouse.down(); await page.mouse.move(590, 290);
        await state("trigger active", ".aai__trigger"); await page.mouse.up();
      }
      if (sheetPath) sheet.push({ tag, shots });
    }
    await ctx.close();
  };
  await Promise.all((quick ? ["light"] : ["light", "dark"]).flatMap((scheme) => ["clean", "hostile"].map((mode) => runPass(scheme, mode))));

  if (sheetPath) {
    const page = await (await browser.newContext({ viewport: { width: 2400, height: 800 } })).newPage();
    const cell = (s) => `<section><h4>${s.tag}</h4>${s.shots.map(([l, b]) => `<figure><img src="data:image/png;base64,${b}"><figcaption>${l}</figcaption></figure>`).join("")}</section>`;
    await page.setContent(`<style>body{margin:8px;font:11px system-ui;background:#888;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:2400px;box-sizing:border-box}
      section{background:#ccc;padding:6px}h4{margin:0 0 4px;font-size:12px}figure{margin:0 0 3px}img{width:100%;display:block;image-rendering:auto}figcaption{font-size:10px;color:#222}</style>${sheet.map(cell).join("")}`);
    // Chromium cannot capture a page this tall in one image: write parts of at most 12000px (states-matrix.png, states-matrix-2.png, ...).
    const height = await page.evaluate(() => document.documentElement.scrollHeight), PART = 12000;
    for (let i = 0, y = 0; y < height; i++, y += PART) {
      const file = i ? sheetPath.replace(/(\.png)?$/, `-${i + 1}.png`) : sheetPath;
      await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y, width: 2400, height: Math.min(PART, height - y) } });
      console.log("contact sheet:", file);
    }
  }
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}

// Host CSS must not change anything the widget sets itself.
for (const [key, h] of sigs) {
  if (h.mode !== "hostile") continue;
  const clean = sigs.get(key.replace(/^hostile\|/, "clean|"));
  if (!clean) continue;
  for (const f of Object.keys(clean.sig)) {
    checks++;
    const same = f === "height" ? Math.abs(clean.sig[f] - h.sig[f]) <= 1 : clean.sig[f] === h.sig[f];
    if (!same) failures.push({ tag: h.tag, state: h.state, element: "host leak: " + f, kind: "style", ratio: 0, need: 0, fg: String(h.sig[f]), bg: "clean: " + clean.sig[f] });
  }
}

const uniq = (list) => { const seen = new Set(); return list.filter((e) => { const k = [e.tag.replace(/\(.*?\)/, ""), e.state, e.element, e.kind].join("|"); return seen.has(k) ? false : seen.add(k); }); };
const show = (rows) => { for (const e of rows) console.log(`  ${e.tag} | ${e.state} | ${e.element} ${e.kind} ${e.ratio}:1 (need ${e.need}) fg ${e.fg} on ${e.bg}`); };
if (warnings.length) { console.log(`warnings (brand icons below 3:1): ${warnings.length}`); show(uniq(warnings).slice(0, 12)); }
if (failures.length) {
  console.log(`FAIL: ${failures.length} of ${checks} checks below threshold (${uniq(failures).length} distinct)`);
  show(uniq(failures));
  process.exit(1);
}
console.log(`ok: ${checks} contrast checks, 0 failures, ${warnings.length} warnings`);
