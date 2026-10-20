// Same API as "ask-ai-widget" but without the built-in services: string keys resolve only through registerService().
// Import the services you need from "ask-ai-widget/services".
export type * from "../types";
export { registry, registerService } from "../registry";
export { resolveServices, getItems, activate, mount } from "../lite-api";
export { builtinInput, rootAttrs } from "../model";
export { readQuestion, getInput } from "../open";
export { buildUrl } from "../url";
export { getContext, render, buildPrompt } from "../prompt";
export { css, injectStyles } from "../styles";
export { version } from "../version";
