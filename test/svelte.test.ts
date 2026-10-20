import { describe, it, expect } from "vitest";
import { askAI } from "../src/svelte";

describe("svelte action", () => {
  it("mounts, updates and destroys", () => {
    const node = document.createElement("div");
    node.className = "mine";
    document.body.append(node);
    const act = askAI(node, { services: ["claude"], label: "A", size: "lg" }) as { update(o: any): void; destroy(): void };
    expect(node.querySelectorAll(".aai__btn")).toHaveLength(1);
    expect(node.dataset.size).toBe("lg");
    act.update({ services: ["claude", "grok"] }); // label and size were removed -> reset
    expect(node.querySelectorAll(".aai__btn")).toHaveLength(2);
    expect(node.querySelector(".aai__label")).toBeNull();
    expect(node.dataset.size).toBe("md");
    act.destroy();
    expect(node.innerHTML).toBe("");
    expect(node.className).toBe("mine");
  });
});
