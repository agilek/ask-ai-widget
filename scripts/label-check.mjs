// Real-browser geometry of `labelPosition` (left, top, right, bottom) in the row and question layouts at 640px and 375px.
// With the built-in field the buttons (or the menu trigger) must always sit on the field's row, right of it.
//   npm run build && npm run check:label     (CHROMIUM_PATH points at a browser binary, see contrast-check.mjs)
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const tmp = mkdtempSync(join(tmpdir(), "ask-ai-label-"));
writeFileSync(join(tmp, "index.html"), `<!doctype html><meta charset="utf-8"><style>body{margin:12px;font:14px system-ui}</style><div id="w"></div>
<script src="file://${root}/dist/ask-ai.min.js"></script>`);

const SERVICES = ["chatgpt", "claude", "perplexity", "gemini", "grok", "mistral", "deepseek"];
const fails = [];
let checks = 0;
const box = (r) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom, cy: (r.top + r.bottom) / 2 });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 600 } });
  await page.goto("file://" + join(tmp, "index.html"));
  for (const width of [640, 375])
    for (const layout of ["row", "menu"])
      for (const input of [false, true]) {
        if (layout === "menu" && !input) continue; // the menu layout has no label (ignored), only the field row matters
        for (const pos of ["left", "top", "right", "bottom", "none"]) {
          await page.setViewportSize({ width, height: 600 });
          const g = await page.evaluate(({ layout, input, pos, SERVICES }) => {
            const w = document.getElementById("w");
            window.AskAI.mount(w, { services: SERVICES, layout, input, label: "Ask AI about this page", labelPosition: pos, context: false });
            const r = (s) => document.querySelector(s)?.getBoundingClientRect();
            const rects = { label: r(".aai__label"), form: r(".aai__form"), list: r(layout === "menu" ? ".aai__trigger" : ".aai__list"), root: w.getBoundingClientRect() };
            return Object.fromEntries(Object.entries(rects).map(([k, v]) => [k, v && { left: v.left, right: v.right, top: v.top, bottom: v.bottom }]));
          }, { layout, input, pos, SERVICES });
          const tag = `${width}px ${layout}/${input ? "question" : "row"} labelPosition=${pos}`;
          const ok = (cond, msg) => { checks++; if (!cond) fails.push(`${tag}: ${msg}`); };
          const L = g.label && box(g.label), F = g.form && box(g.form), B = box(g.list), E = 1;
          if (pos === "none" || layout === "menu") { ok(!g.label, "no visible label expected"); }
          if (input) {
            ok(Math.abs(F.cy - B.cy) <= 3, `buttons are not on the field's row (field centre ${F.cy}, buttons ${B.cy})`);
            ok(B.l >= F.r - E, `buttons not right of the field (field right ${F.r}, buttons left ${B.l})`);
          }
          if (!L) continue;
          // in question mode on a narrow container (<= 440px) left and right move to the top
          const effective = input && width <= 440 && (pos === "left" || pos === "right") ? "top" : pos;
          const rowTop = input ? Math.min(F.t, B.t) : B.t, rowBottom = input ? Math.max(F.b, B.b) : B.b;
          if (effective === "top") ok(L.b <= rowTop + E, `label (bottom ${L.b}) not above the row (top ${rowTop})`);
          else if (effective === "bottom") ok(L.t >= rowBottom - E, `label (top ${L.t}) not below the row (bottom ${rowBottom})`);
          else if (effective === "right") ok(L.l >= B.r - E || (!input && L.t >= rowBottom - E), `label (left ${L.l}) not after the buttons (right ${B.r})`);
          else ok(L.r <= (input ? F.l : B.l) + E || (!input && L.b <= B.t + E), `label (right ${L.r}) not before the row (left ${input ? F.l : B.l})`);
        }
      }
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
if (fails.length) { console.error(`FAIL: ${fails.length} of ${checks} label position checks`); for (const f of fails) console.error("  " + f); process.exit(1); }
console.log(`ok: ${checks} label position checks`);
