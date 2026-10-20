# Examples

Each example is self-contained and depends on the library via `"ask-ai-widget": "file:../.."`. Run `npm run build` at the repo root first, then `npm i && npm run dev` inside an example.

| Example | Stack | Shows |
| --- | --- | --- |
| [html](./html) | Plain HTML, CDN build | `AskAI.mount`, `input`, zero-JS `data-ask-ai`, `--aai-*` theming |
| [vite-react](./vite-react) | Vite + React + TS | Function prompt, controlled `question`, `onOpen`, `lite/react` |
| [nextjs](./nextjs) | Next.js App Router + TS | Server component, `page={{ url, title }}`, CSS in layout |
| [vue](./vue) | Vite + Vue 3 | `v-model:question`, `@open`, `plugin` |
| [sveltekit](./sveltekit) | SvelteKit (Svelte 5) | `use:askAI` with reactive options |
| [astro](./astro) | Astro | `<ask-ai>` element, function props |
