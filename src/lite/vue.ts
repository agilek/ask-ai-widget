import type { App } from "vue";
import { makeAskAI } from "../vue-impl";
import { withRegistry } from "../lite-normalize";

export type * from "../types";

/**
 * Ask-AI button row without built-in services: `:services="[claude, chatgpt]"` with objects from "ask-ai-widget/services".
 * A string in `services` resolves only after `registerService()`; otherwise it is dropped with a console warning.
 */
export const AskAI = /* @__PURE__ */ makeAskAI(withRegistry);

/** `app.use(plugin)` registers `<AskAI>` globally. */
export const plugin = {
  install(app: App) {
    app.component("AskAI", AskAI);
  },
};
