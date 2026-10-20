import { createApp } from "vue";
import { plugin as askAI } from "ask-ai-widget/vue";
import "ask-ai-widget/style.css";
import App from "./App.vue";

// Registers <AskAI> globally; or import { AskAI } from "ask-ai-widget/vue" per component.
createApp(App).use(askAI).mount("#app");
