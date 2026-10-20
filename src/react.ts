"use client";
import { makeAskAI } from "./react-impl";
import { withBuiltins } from "./normalize";

export type * from "./types";
export type { AskAIProps } from "./react-impl";

/**
 * Ask-AI button row. Renders real anchors with real hrefs on the server; inline function props
 * (`prompt={(ctx) => ...}`) need no memoising. For zero-FOUC SSR import `ask-ai-widget/style.css`.
 * For hydration-exact hrefs pass `page={{ url }}` when rendering on the server.
 */
export const AskAI = /* @__PURE__ */ makeAskAI(withBuiltins);
