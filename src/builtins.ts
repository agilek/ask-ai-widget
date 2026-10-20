import type { ServiceDef } from "./types";
import { chatgptIcon, claudeIcon, perplexityIcon, geminiIcon, grokIcon, mistralIcon, deepseekIcon } from "./icons";

export type { ServiceDef };

// One constant per service so bundlers keep only the ones you import (the calls are pure, so unused ones are dropped).
const def = (key: string, label: string, url: string, icon: string, color?: string, prefill?: boolean): ServiceDef =>
  ({ key, label, url, param: "q", icon, color, prefill });

export const chatgpt: ServiceDef = /* @__PURE__ */ def("chatgpt", "ChatGPT", "https://chatgpt.com/", chatgptIcon);
export const claude: ServiceDef = /* @__PURE__ */ def("claude", "Claude", "https://claude.ai/new", claudeIcon, "#D97757");
export const perplexity: ServiceDef = /* @__PURE__ */ def("perplexity", "Perplexity", "https://www.perplexity.ai/search", perplexityIcon, "#22B8CD");
export const gemini: ServiceDef = /* @__PURE__ */ def("gemini", "Gemini", "https://gemini.google.com/app", geminiIcon, "#3186FF", false);
export const grok: ServiceDef = /* @__PURE__ */ def("grok", "Grok", "https://grok.com/", grokIcon);
export const mistral: ServiceDef = /* @__PURE__ */ def("mistral", "Mistral", "https://chat.mistral.ai/chat", mistralIcon, "#FA500F");
export const deepseek: ServiceDef = /* @__PURE__ */ def("deepseek", "DeepSeek", "https://chat.deepseek.com/", deepseekIcon, "#4D6BFE", false);

/** All built-in services in display order. */
export const builtins: ServiceDef[] = [chatgpt, claude, perplexity, gemini, grok, mistral, deepseek];
