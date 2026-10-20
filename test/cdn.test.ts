import { describe, it, expect } from "vitest";
import * as AskAI from "../src/cdn";

describe("cdn entry", () => {
  it("exposes the core API and the element", () => {
    expect(typeof AskAI.mount).toBe("function");
    expect(typeof AskAI.getItems).toBe("function");
    expect(AskAI.AskAIElement).toBe(customElements.get("ask-ai"));
  });
  it("auto-mounts [data-ask-ai] once", () => {
    document.body.innerHTML =
      '<div data-ask-ai data-services="claude,grok" data-label="Ask" data-variant="brand" data-show-labels data-context="none"></div>';
    AskAI.init();
    AskAI.init();
    const d = document.querySelector<HTMLElement>("[data-ask-ai]")!;
    expect(d.classList.contains("aai")).toBe(true);
    expect(d.dataset.variant).toBe("brand");
    expect(d.querySelectorAll(".aai__btn")).toHaveLength(2);
    expect(d.querySelector(".aai__label")!.textContent).toBe("Ask");
  });
});
