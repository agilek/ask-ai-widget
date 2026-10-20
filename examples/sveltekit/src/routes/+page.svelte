<script lang="ts">
  import { askAI } from "ask-ai-widget/svelte";

  let question = $state("");
  let theme = $state<"light" | "dark">("light");
</script>

<svelte:head><title>ask-ai-widget example (SvelteKit)</title></svelte:head>

<main>
  <h1>Docs</h1>

  <h2>Predefined prompt</h2>
  <div
    use:askAI={{
      label: "Ask AI about this page",
      prompt: (ctx) => `Explain "${ctx.title}" from these docs with a minimal example.`,
      theme,
      onOpen: ({ service }) => console.log("analytics: ask_ai_open", service)
    }}
  ></div>
  <button onclick={() => (theme = theme === "light" ? "dark" : "light")}>Theme: {theme}</button>

  <h2>Your own input</h2>
  <input bind:value={question} placeholder="Ask anything about this page..." />
  <!-- Reactive options: the action's update() runs whenever `question` changes. -->
  <div
    use:askAI={{
      label: "Ask AI about this page",
      input: true,
      prompt: `Answer using this page: ${question}`
    }}
  ></div>
</main>
