# AGENTS.md

Guidance for coding agents working on this repository. For using the library, read `README.md` or `llms.txt`.

## What this is

`ask-ai-widget`: a zero-runtime-dependency "Ask AI about this page" button row (ChatGPT, Claude, Perplexity, Gemini, Grok, Mistral, DeepSeek) shipped as a core API, a `<ask-ai>` element, and React / Vue / Svelte wrappers, plus `lite` entries for tree-shaking.

## Layout

- `src/types.ts`: public types. `src/index.ts`: core entry. `src/lite/*`: lite entries (no built-in services).
- `src/prompt.ts` (context, templates, truncation), `src/url.ts`, `src/open.ts` (activate: validation, clipboard, `window.open`), `src/model.ts` (`getItems`, `rootAttrs`, `str` for the `strings` option, menu-layout helpers, shared by every renderer), `src/menu.ts` (dropdown behaviour: open/close, keyboard, outside press, placement; bound by every renderer, state lives in the DOM), `src/mount.ts` (vanilla renderer), `src/react-impl.ts`, `src/vue-impl.ts`, `src/svelte-impl.ts`, `src/element-impl.ts` (custom element base + `parseAttrs`).
- `src/registry.ts` (the `registry` object: registered services only), `src/builtins.ts` (one const per service), `src/icons.ts` (generated), `src/normalize.ts` (`withBuiltins`) and `src/lite-normalize.ts` (`withRegistry`).
- `src/cdn.ts`: IIFE entry (global `AskAI`, `init()` for `[data-ask-ai]`). `src/style.css`: the stylesheet source.
- `scripts/`: `build-css.mjs`, `css-check.mjs`, `css-string.mjs`, `size.mjs`, `compact-icons.mjs`, `icons-src/*.svg`. `test/`: vitest + happy-dom. `demo/index.html`: playground. `examples/`: framework examples.
- Root `style.css` and `dist/` are build output.

## Commands

```bash
npm install
npm run build   # tsup + style.css (must run before size and the demo)
npm test        # vitest
npm run size    # bundles real consumer imports; fails on budget / tree-shaking regressions
node scripts/compact-icons.mjs   # regenerate src/icons.ts
```

Run `npm run build && npm test && npm run size` before finishing a change.

## Invariants (do not break)

- **Zero runtime dependencies.** `react`, `vue`, `svelte` are optional peers and stay external.
- **Size budget** is enforced by `npm run size` (CDN IIFE must stay under 30,720 bytes minified; lite must be at least 2,000 bytes smaller than default with two services; lite bundles must not contain other logos). Do not raise the limits to make a change fit.
- **CSS architecture** (`src/style.css`): public `--aai-*` properties are never declared by the library. Variants, sizes, shapes and themes set PRIVATE short properties (`--_b`, `--_f`, ...) on the root, and every rule consumes `var(--aai-x, var(--_x))`, so a user value set on `:root`, an ancestor, the widget or inline wins. Keep the public names as documented in the README table. Structural/visual rules use a single class plus at most one pseudo-class or attribute (specificity <= (0,2,0): beats `a {}` / `svg {}` resets, loses to later user classes). Only rules that set nothing but custom properties may be more specific. No `!important`, no ids. `scripts/css-check.mjs` enforces it (run by `scripts/build-css.mjs` and by a test). `injectStyles` prepends the `<style>` to `<head>`.
- **Identical markup across renderers** (vanilla, React, Vue, SSR): same classes, data attributes, aria attributes and element order. Change `model.ts` / all renderers together and keep the renderer tests in sync (`test/features.test.ts` covers cross-renderer behaviour). Renderers use `str(opts, key, service)` for the widget's own texts and `selDown` / `selFocus` (prompt.ts) for selection capture.
- **No side-effect registration of built-ins.** Importing `ask-ai-widget` or `lite` must not mutate the registry. Built-ins resolve through `withBuiltins`; lite resolves only registered services or objects. `ask-ai-widget/services` has no other runtime exports.
- **One export per service** (`export const claude = /* @__PURE__ */ def(...)`) and one icon constant each, so unused logos tree-shake.
- **Prompts resolve synchronously, up to `window.open`**, inside the click handler. No `await`, no timers before opening. Functions in options must be sync.
- **SSR-safe**: no `window`/`document` access at module load or in `getItems`/`buildPrompt` without guards. `page` overrides detected values.
- `package.json` `sideEffects` must keep `dist/ask-ai.min.js`, `dist/element.*`, `dist/lite/element.*` and `*.css`.
- No network requests, storage or tracking.

## Adding a service

1. Put the full-precision monochrome SVG (24x24 viewBox, `fill="currentColor"`) in `scripts/icons-src/<key>.svg` (lobe-icons static SVGs are MIT).
2. Run `node scripts/compact-icons.mjs`; it rewrites `src/icons.ts` with `<key>Icon`.
3. In `src/builtins.ts` add `export const <key>: ServiceDef = /* @__PURE__ */ def("<key>", "Label", "https://...", <key>Icon, "#brandcolor", prefill?)` and append it to `builtins`. Use `prefill: false` when the URL parameter is not honoured (the prompt is then copied to the clipboard).
4. Add the key to the `BUILTIN` regex in `src/lite-normalize.ts` and to `others` / the icon checks in `scripts/size.mjs`.
5. Add tests: `test/builtins.test.ts` (order, export list), `test/core.test.ts` / `mount.test.ts` (URL, clipboard behaviour), `test/lite.test.ts`.
6. Update the README services table and counts, `llms.txt`, the playground (it reads services from the library), the `package.json` description/keywords, and the `ServiceKey` union in `src/types.ts`.
7. `npm run build && npm test && npm run size`.

## Style

TypeScript strict, ES2019 output, small functions, comments explain why. Keep docs accurate: verify option and attribute names against `src/types.ts`, `src/element-impl.ts` and the wrappers.
