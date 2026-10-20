// Stylesheet invariants, shared by scripts/build-css.mjs and the tests.
// 1. No rule is more specific than (0,2,0), unless it only sets custom properties (presets, themes, sizes, shapes).
// 2. No !important.

const MAX = [0, 2, 0];

/** Specificity [ids, classes/attributes/pseudo-classes, elements] of one complex selector. :where() counts as 0. */
export function specificity(sel) {
  const s = sel.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, "").replace(/\[[^\]]*\]/g, "[]");
  if (/:(is|not|has|matches)\(/.test(s)) throw new Error(`css-check: unsupported selector ${sel}`);
  const count = (re) => (s.match(re) || []).length;
  const pseudoEl = count(/::[\w-]+/g);
  return [
    count(/#[\w-]+/g),
    count(/\.[\w-]+/g) + count(/\[\]/g) + count(/(?<!:):[\w-]+/g),
    count(/(^|[\s>+~])[a-zA-Z][\w-]*/g) + pseudoEl,
  ];
}

const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Returns a list of human readable violations (empty when the stylesheet is fine). */
export function checkCss(css) {
  const errors = [];
  if (/!\s*important/i.test(css)) errors.push("!important is not allowed");
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]+\{/g, "");
  for (const rule of flat.split("}").map((r) => r.trim()).filter(Boolean)) {
    const [sel, body = ""] = rule.split("{");
    const varOnly = body.split(";").map((d) => d.trim()).filter(Boolean).every((d) => d.startsWith("--"));
    if (varOnly) continue;
    for (const one of sel.split(",")) {
      const sp = specificity(one.trim());
      if (cmp(sp, MAX) > 0) errors.push(`${one.trim()} has specificity (${sp}), max is (${MAX})`);
    }
  }
  return errors;
}
