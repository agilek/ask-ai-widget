"use client";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import { makeAskAI } from "../react-impl";
import type { LiteAskAIProps } from "../react-impl";
import { withRegistry } from "../lite-normalize";

export type * from "../types";
export type { AskAIProps, LiteAskAIProps } from "../react-impl";

/**
 * Ask-AI button row without built-in services: `services={[claude, chatgpt]}` with objects from
 * "ask-ai-widget/services" (strings resolve only after `registerService()`). Pass `page={{ url }}` when
 * rendering on the server for hydration-exact hrefs.
 */
export const AskAI = /* @__PURE__ */ makeAskAI(withRegistry) as ForwardRefExoticComponent<LiteAskAIProps & RefAttributes<HTMLDivElement>>;
