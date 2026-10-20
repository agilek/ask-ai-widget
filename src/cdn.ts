import { mount } from "./default";
import { parseAttrs } from "./element";

export * from "./index";
export { AskAIElement, defineAskAI, parseAttrs } from "./element"; // importing element.ts also defines <ask-ai>

/** Mount every `[data-ask-ai]` element (same `data-*` grammar as the `<ask-ai>` attributes). Safe to call repeatedly. */
export function init(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-ask-ai]").forEach((el) => {
    if (!(el as any)._aai) (el as any)._aai = mount(el, parseAttrs(el, "data-"));
  });
}

document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => init()) : init();
