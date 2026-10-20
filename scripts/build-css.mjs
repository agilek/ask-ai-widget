// Writes style.css (the published stylesheet) from the minified css exported by dist/index.js (source: src/style.css).
import { writeFileSync } from "node:fs";
import { checkCss } from "./css-check.mjs";
const { css } = await import("../dist/index.js");
const errors = checkCss(css);
if (errors.length) { console.error("CSS invariants broken:\n- " + errors.join("\n- ")); process.exit(1); }
writeFileSync(new URL("../style.css", import.meta.url), css + "\n");
console.log("style.css", css.length, "bytes");
