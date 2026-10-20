// Regenerates src/icons.ts (one `export const <key>Icon` per service, so unused logos tree-shake) from the full-precision SVGs in scripts/icons-src/ (lobe-icons static svg, MIT).
//   node scripts/compact-icons.mjs [decimals=2] [--out file] [--json]
// Path rounding is drift-free: every point is rounded in ABSOLUTE space and relative deltas are derived from the
// already-rounded previous point, so error never accumulates along a path (max error per point = 0.5 * 10^-decimals).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const dec = Number(args.find((a) => /^\d+$/.test(a)) ?? 2);
const outArg = args.indexOf("--out");
const dir = new URL("./icons-src/", import.meta.url);

const ARGC = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/** Tokenize path data into [cmd, numbers[]] segments (handles packed numbers and arc flags like "a1 1 0 01.5.5"). */
export function parse(d) {
  const segs = [];
  let i = 0;
  const num = () => {
    const m = /^\s*,?\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/i.exec(d.slice(i));
    if (!m) throw new Error("bad number at " + i + ": " + d.slice(i, i + 20));
    i += m[0].length;
    return parseFloat(m[1]);
  };
  const flag = () => {
    const m = /^\s*,?\s*([01])/.exec(d.slice(i));
    if (!m) throw new Error("bad flag at " + i);
    i += m[0].length;
    return +m[1];
  };
  let cmd = "";
  while (true) {
    const rest = /^\s*([a-zA-Z])/.exec(d.slice(i));
    if (rest) { cmd = rest[1]; i += rest[0].length; if (cmd.toLowerCase() === "z") { segs.push([cmd, []]); continue; } }
    else if (/^\s*$/.test(d.slice(i))) break;
    else if (!cmd || cmd.toLowerCase() === "z") throw new Error("unexpected data at " + i);
    const n = ARGC[cmd.toLowerCase()];
    const a = [];
    for (let k = 0; k < n; k++) a.push(cmd.toLowerCase() === "a" && (k === 3 || k === 4) ? flag() : num());
    segs.push([cmd, a]);
    if (cmd === "M") cmd = "L"; else if (cmd === "m") cmd = "l"; // implicit lineto after moveto
  }
  return segs;
}

const r = (x) => { const p = 10 ** dec; return Math.round(x * p + 1e-9 * Math.sign(x)) / p; };
/** Shortest textual form: no leading zero, no trailing zeros, no "-0". */
const fmt = (x) => {
  let s = (Math.round(x * 10 ** dec) / 10 ** dec).toFixed(dec).replace(/\.?0+$/, "");
  if (s === "-0" || s === "") s = "0";
  return s.replace(/^(-?)0\./, "$1.");
};
/** Join numbers with the minimal separators. */
function join(nums, prev = "") {
  let out = "";
  for (const n of nums) {
    const flag = typeof n === "string"; // arc flag: one char, needs no separator before the next token
    const s = flag ? n : fmt(n);
    const tight = prev === "flag" || s[0] === "-" || (s[0] === "." && prev.includes("."));
    if ((out || prev) && !tight && !(flag && prev === "flag")) out += " ";
    out += s;
    prev = flag ? "flag" : s;
  }
  return out;
}

export function compact(d) {
  const segs = parse(d);
  // absolute (full precision) tracking for the source, rounded tracking for the output
  let ax = 0, ay = 0, sx = 0, sy = 0; // source current point / subpath start
  let rx = 0, ry = 0, rsx = 0, rsy = 0; // rounded current point / subpath start
  let cpx = 0, cpy = 0; // rounded second control point of the previous C/S (else the current point)
  let out = "", last = "", lastTok = "";
  // The letter is omitted when it repeats; then the first number may need a separator from the previous segment.
  const emit = (cmd, nums) => {
    const elide = cmd === last && cmd !== "M" && cmd !== "m";
    return elide ? join(nums, lastTok) : cmd + join(nums);
  };
  for (const [cmd, a] of segs) {
    let C = cmd.toUpperCase();
    const rel = cmd === cmd.toLowerCase();
    if (C === "Z") { out += cmd === last ? "" : "z"; ax = sx; ay = sy; rx = rsx; ry = rsy; last = "z"; continue; }
    // source absolute coordinates for this segment
    let extra = [];
    const ox = rel ? ax : 0, oy = rel ? ay : 0;
    let endx, endy, pairs = [];
    if (C === "H") { endx = a[0] + ox; endy = ay; }
    else if (C === "V") { endx = ax; endy = a[0] + oy; }
    else if (C === "A") { endx = a[5] + ox; endy = a[6] + oy; extra = [a[0], a[1], a[2], a[3], a[4]]; }
    else { for (let k = 0; k < a.length; k += 2) pairs.push([a[k] + ox, a[k + 1] + oy]); [endx, endy] = pairs[pairs.length - 1]; }
    // shorthands that only become possible after rounding
    if (C === "L" && (r(endx) === rx) !== (r(endy) === ry)) C = r(endx) === rx ? "V" : "H";
    if (C === "C" && r(pairs[0][0]) === 2 * rx - cpx && r(pairs[0][1]) === 2 * ry - cpy) { C = "S"; pairs = pairs.slice(1); }
    // candidates: absolute and relative encodings, both anchored to the rounded point
    const enc = (relative) => {
      const bx = relative ? rx : 0, by = relative ? ry : 0;
      let nums;
      if (C === "H") nums = [r(endx) - bx];
      else if (C === "V") nums = [r(endy) - by];
      else if (C === "A") nums = [r(extra[0]), r(extra[1]), r(extra[2]), String(extra[3]), String(extra[4]), r(endx) - bx, r(endy) - by];
      else nums = pairs.flatMap(([x, y]) => [r(x) - bx, r(y) - by]);
      const letter = relative ? C.toLowerCase() : C;
      return { letter, str: emit(letter, nums), tok: typeof nums.at(-1) === "string" ? "flag" : fmt(nums.at(-1)) };
    };
    // arc flags must stay adjacent-capable: keep as strings; join handles "0"/"1" with separators (safe, 1 char)
    let best = enc(false), alt = enc(true);
    if (C === "M" && out === "") alt = best; // first moveto: relative == absolute, keep M
    if (alt.str.length < best.str.length) best = alt;
    out += best.str;
    last = best.letter;
    lastTok = best.tok;
    ax = endx; ay = endy;
    rx = r(endx); ry = r(endy);
    if (C === "C" || C === "S") { cpx = r(pairs.at(-2)[0]); cpy = r(pairs.at(-2)[1]); } else { cpx = rx; cpy = ry; }
    if (C === "M") { sx = ax; sy = ay; rsx = rx; rsy = ry; }
  }
  return out;
}

/** All absolute points of a path (control points and endpoints), for verification. */
export function absPoints(d) {
  const pts = [];
  let x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0;
  for (const [cmd, a] of parse(d)) {
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === "Z") { x = sx; y = sy; pts.push([x, y]); continue; }
    if (C === "S") pts.push([2 * x - cx, 2 * y - cy]); // implicit first control point
    let nx = x, ny = y;
    if (C === "H") nx = a[0] + ox;
    else if (C === "V") ny = a[0] + oy;
    else if (C === "A") { nx = a[5] + ox; ny = a[6] + oy; pts.push([a[0], a[1]]); }
    else for (let k = 0; k < a.length; k += 2) { nx = a[k] + ox; ny = a[k + 1] + oy; pts.push([nx, ny]); }
    if (C === "H" || C === "V" || C === "A") pts.push([nx, ny]);
    if (C === "C" || C === "S") { cx = pts.at(-2)[0]; cy = pts.at(-2)[1]; } else { cx = nx; cy = ny; }
    x = nx; y = ny;
    if (C === "M") { sx = x; sy = y; }
  }
  return pts;
}

function main() {
  const entries = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".svg")).sort()) {
    const svg = readFileSync(new URL(f, dir), "utf8");
    const d = /\sd="([^"]+)"/.exec(svg)[1];
    const small = compact(d);
    // verify: same structure, every absolute point within half a unit of the last decimal
    const A = absPoints(d), B = absPoints(small);
    const err = A.length === B.length ? Math.max(...A.map(([x, y], i) => Math.max(Math.abs(x - B[i][0]), Math.abs(y - B[i][1])))) : Infinity;
    if (!(err <= 0.5 * 10 ** -dec + 1e-6)) throw new Error(`${f}: max point error ${err} exceeds tolerance`);
    entries[f.replace(/\.svg$/, "")] = { orig: d, small, err };
  }
  if (args.includes("--json")) { console.log(JSON.stringify(entries)); return; }
  const order = ["chatgpt", "claude", "perplexity", "gemini", "grok", "mistral", "deepseek"];
  const body = order.map((k) => `export const ${k}Icon = ${JSON.stringify(entries[k].small)};`).join("\n");
  const src = `// Monochrome logo paths (24x24 viewBox, fill-rule evenodd) from lobe-icons, MIT © LobeHub.
// Logos are trademarks of their respective owners; used to link to their services.
// Generated by scripts/compact-icons.mjs (${dec} decimals) from the full-precision SVGs in scripts/icons-src/. Do not edit by hand.
// One export per service so bundlers can drop the logos a consumer does not import.
${body}
`;
  const target = outArg >= 0 ? args[outArg + 1] : new URL("../src/icons.ts", import.meta.url).pathname;
  writeFileSync(target, src);
  for (const k of order) console.log(k.padEnd(11), entries[k].orig.length, "->", entries[k].small.length, "max err", entries[k].err.toFixed(4));
}
if (process.argv[1] === new URL(import.meta.url).pathname) main();
