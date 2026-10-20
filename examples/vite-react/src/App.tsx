import { useState } from "react";
import { AskAI } from "ask-ai-widget/react";
import { LiteAsk } from "./LiteAsk";

export function App() {
  const [question, setQuestion] = useState("");

  return (
    <main>
      <h1>Docs</h1>

      <h2>Predefined prompt</h2>
      <AskAI
        label="Ask AI about this page"
        prompt={(ctx) => `Explain "${ctx.title}" from these docs and show a minimal example.`}
        onOpen={({ service, url }) => console.log("analytics: ask_ai_open", { service, url })}
      />

      <h2>User question (controlled)</h2>
      <AskAI
        label="Ask AI about this page"
        input={{ placeholder: "Ask anything about this page..." }}
        question={question}
        onQuestionChange={setQuestion}
        prompt="Answer using this page: {question}"
      />
      <p>Current question: {question || "(empty)"}</p>

      <h2>Lite (tree-shaken)</h2>
      <LiteAsk />
    </main>
  );
}
