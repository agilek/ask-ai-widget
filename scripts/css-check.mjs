// Stylesheet invariants, shared by scripts/build-css.mjs and the tests.
// 1. Base rules are at most (0,2,0) and state rules (:hover, :focus-visible, :active, :visited, [aria-*], ::placeholder)
//    at most (0,3,0), unless a rule only sets custom properties (presets, themes, sizes, shapes). That is enough to beat
//    host rules on bare elements (`a:hover`, `input[type=text]:hover`, `.prose a`, `button:hover`) while a user's
//    two-class selector (`.my-site .aai__btn`) or a --aai-* property still wins.
// 2. No !important.

const MAX = [0, 2, 0];
const MAX_STATE = [0, 3, 0];
const STATE = /:(hover|active|focus|focus-visible|visited)\b|::placeholder|\[aria-/;

/** Specificity [ids, classes/attributes/pseudo-classes, elements] of one complex selector. :where() counts as 0. */
export function specificity(sel) {
  let s = sel.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, "").replace(/\[[^\]]*\]/g, "[]");
  if (/:(is|not|matches)\(/.test(s)) throw new Error(`css-check: unsupported selector ${sel}`);
  // :has() takes the specificity of its argument (no nesting, relative combinator stripped).
  const extra = [0, 0, 0];
  s = s.replace(/:has\(([^()]*)\)/g, (_, inner) => {
    specificity(inner.replace(/^\s*[>+~]\s*/, "")).forEach((v, i) => (extra[i] += v));
    return "";
  });
  const count = (re) => (s.match(re) || []).length;
  const pseudoEl = count(/::[\w-]+/g);
  return [
    count(/#[\w-]+/g) + extra[0],
    count(/\.[\w-]+/g) + count(/\[\]/g) + count(/(?<!:):[\w-]+/g) + extra[1],
    count(/(^|[\s>+~])[a-zA-Z][\w-]*/g) + pseudoEl + extra[2],
  ];
}

const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Returns a list of human readable violations (empty when the stylesheet is fine). */
export function checkCss(css) {
  const errors = [];
  if (/!\s*important/i.test(css)) errors.push("!important is not allowed");
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@(media|container)[^{]+\{/g, "");
  for (const rule of flat.split("}").map((r) => r.trim()).filter(Boolean)) {
    const [sel, body = ""] = rule.split("{");
    const varOnly = body.split(";").map((d) => d.trim()).filter(Boolean).every((d) => d.startsWith("--"));
    if (varOnly) continue;
    for (const one of sel.split(",")) {
      const sp = specificity(one.trim());
      const max = STATE.test(one) ? MAX_STATE : MAX;
      if (cmp(sp, max) > 0) errors.push(`${one.trim()} has specificity (${sp}), max is (${max})`);
    }
  }
  return errors;
}
