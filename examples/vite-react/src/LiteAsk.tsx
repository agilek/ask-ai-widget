import { AskAI } from "ask-ai-widget/lite/react";
import { claude, chatgpt } from "ask-ai-widget/services";

// Only the services you import end up in the bundle.
export function LiteAsk() {
  return (
    <AskAI
      services={[claude, chatgpt]}
      label="Ask AI about this page"
      prompt="Summarize this page in three bullet points."
    />
  );
}
