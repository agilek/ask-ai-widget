import { AskAI } from "ask-ai-widget/react";

// Server component: <AskAI> renders real <a href> links on the server.
const PAGE = { url: "https://example.com/get-started", title: "Get started" };

export default function Page() {
  return (
    <main>
      <h1>{PAGE.title}</h1>
      {/* `page` makes server and client hrefs identical, so hydration matches. */}
      <AskAI
        label="Ask AI about this page"
        page={PAGE}
        prompt="Explain the key steps on this page."
      />
    </main>
  );
}
