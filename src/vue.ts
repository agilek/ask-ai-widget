import type { App } from "vue";
import { makeAskAI } from "./vue-impl";
import { withBuiltins } from "./normalize";

export type * from "./types";

/**
 * Ask-AI button row. Renders real anchors with real hrefs during SSR. Emits `open` before a service
 * opens and supports `v-model:question` for the built-in input. Extra attrs (class, style, id) fall through.
 * For hydration-exact hrefs pass `:page="{ url }"` when rendering on the server.
 */
export const AskAI = /* @__PURE__ */ makeAskAI(withBuiltins);

/** `app.use(plugin)` registers `<AskAI>` globally. */
export const plugin = {
  install(app: App) {
    app.component("AskAI", AskAI);
  },
};
