# Devlog

## 2026-10-27

### Launch prep: demo site moved to acler.cz, docs audited, npm 0.1.0
The demo/playground/gallery site now lives in the acler-cz repo (`public/ask-ai/`, served at https://acler.cz/ask-ai/, loading the package from jsDelivr); `demo/` was removed from this repo. README/llms.txt were audited against the source (9 confirmed errors fixed), `llms.txt` got no-build/CMS recipes and a Docs section, `context7.json` and `unpkg`/`jsdelivr` fields were added, the repo was made public with description, homepage and topics, README now links the live demo + playground at the top.

**Root cause / approach:** the packed tarball was installed into a clean project and every export tested (import + require + types) before publishing. Review findings that mattered: the repo was private (all links 404), acler.cz serves the homepage for unknown paths (static files in `public/` win over the SPA rewrite), and Cloudflare blocks AI training crawlers on acler.cz regardless of robots.txt (user must allow GPTBot/ClaudeBot for `/ask-ai/*`). `llms-full.txt` on the site is a copy of README.md: refresh it on every release.

→ *Memory saved: `acler-demo-styling.md` (updated), `ai-discoverability.md`*

### Playground and landing polish for the acler.cz look
Landing: bolder narrower headline, squircle buttons and hero card, floating hamburger on phones (thumb reach), nav centered ≥1000px, theme toggle ported 1:1 from the site (sun/moon morph + switch sounds). Playground: full-width segmented controls with a soft selected fill, eye buttons for service visibility (name is a plain label), grip-only reordering (arrows removed, so no keyboard reorder), icon-only copy buttons with checkmark, tab icons (simple-icons, CC0), URL row removed, fixed 360px snippet height so switching tabs never resizes the columns. Small text uses Inter; PP Neue Machina stays on headings, controls and nav.

**Root cause / approach:** hidden attributes lose to `display:inline-flex` (the hidden CSS tab reappeared), and `.open nav` lost specificity to `header.top nav`, so state selectors need equal or higher specificity than the base rule. Text glyphs (⋮⋮, ▲▼) never center or space evenly: use inline SVG.

→ *Memory saved: `acler-demo-styling.md`*

### Demo pages restyled to match acler.cz (subpage feel)
demo/demo.css + new demo/theme.js now mirror the main site: PP Neue Machina, Geist Mono for code, #0e0e0e/#fff monochrome, 4px radii, highlighter-stripe links, `←` back button to `/`, footer with theme toggle + hairline. Theme uses the site's `localStorage.theme` key and `html.light` class (dark default), so the choice is shared when hosted on acler.cz.

**Root cause / approach:** PP Neue Machina is a licensed font, so it is referenced as `/fonts/PPNeueMachina-*.otf` (served by acler.cz) and NOT committed here; locally it falls back to system-ui. To preview locally, serve a dir with symlinks `demo`, `dist`, `fonts`. Widget `theme: "auto"` follows the OS, so the hero remounts on the `themechange` event instead.

→ *No new memory entries.*
