<script setup lang="ts">
import { ref } from "vue";
import { AskAI } from "ask-ai-widget/vue";
import type { OpenDetail } from "ask-ai-widget/vue";

const question = ref("");
const onOpen = ({ service, url }: OpenDetail) => console.log("analytics: ask_ai_open", { service, url });
</script>

<template>
  <main>
    <h1>Docs</h1>

    <h2>Predefined prompt</h2>
    <AskAI
      label="Ask AI about this page"
      :prompt="(ctx) => `Explain &quot;${ctx.title}&quot; from these docs with a minimal example.`"
      @open="onOpen"
    />

    <h2>User question</h2>
    <AskAI
      v-model:question="question"
      label="Ask AI about this page"
      :input="{ placeholder: 'Ask anything about this page...' }"
      prompt="Answer using this page: {question}"
      @open="onOpen"
    />
    <p>Current question: {{ question || "(empty)" }}</p>
  </main>
</template>
