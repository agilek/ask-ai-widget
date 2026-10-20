// Writes the published stylesheets from the sources, minified like the bundle embeds them:
//   style.css      core + menu CSS (opt-in file for SSR: it just works, whatever layout is used)
//   style-row.css  core only (row layout; no dropdown rules)
import { readFileSync, writeFileSync } from "node:fs";
import { checkCss } from "./css-check.mjs";
import { minifyCss } from "./css-string.mjs";

const read = (f) => minifyCss(readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8"));
const core = await read("style.css"), menu = await read("menu.css");
const errors = [...checkCss(core).map((e) => "style.css: " + e), ...checkCss(menu).map((e) => "menu.css: " + e)];
if (errors.length) { console.error("CSS invariants broken:\n- " + errors.join("\n- ")); process.exit(1); }
// The bundle must embed exactly this text (guards against the plugin and this script drifting apart).
const { css } = await import("../dist/index.js");
if (css !== core) { console.error("dist/index.js css differs from src/style.css, rebuild"); process.exit(1); }
writeFileSync(new URL("../style-row.css", import.meta.url), core + "\n");
writeFileSync(new URL("../style.css", import.meta.url), core + menu + "\n");
console.log("style-row.css", core.length, "bytes; style.css", core.length + menu.length, "bytes (core + menu)");
