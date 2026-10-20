export type ServiceKey =
  | "chatgpt" | "claude" | "perplexity" | "gemini" | "grok" | "mistral" | "deepseek"
  | (string & {});

export interface ServiceDef {
  key: string;
  label: string;
  /** Base URL, e.g. "https://claude.ai/new". */
  url: string;
  /** Query param that carries the prompt, e.g. "q". */
  param: string;
  /** SVG path data for a 24x24 viewBox, rendered with fill="currentColor". */
  icon?: string;
  /** Brand color used by the `brand` variant. Omit to inherit the foreground color. */
  color?: string;
  /** false = the URL param is not reliably honoured; prompt is also copied to the clipboard. Default true. */
  prefill?: boolean;
}

/** Values available to every prompt part, as `{name}` in templates or as fields in functions. */
export interface PromptContext {
  service: string;
  question: string;
  url: string;
  title: string;
  description: string;
  selection: string;
  vars: Record<string, string>;
}

/** A prompt part: a template string with `{var}` placeholders, or a function resolved synchronously on click. */
export type PromptPart = string | ((ctx: PromptContext) => string);

export interface InputOptions {
  /** Bind an existing field (selector or element) instead of rendering one. Then only `required` applies. */
  target?: string | HTMLInputElement | HTMLTextAreaElement;
  placeholder?: string;
  /** Block opening when the question is empty. Default true, for the built-in field and for a bound `target` alike. */
  required?: boolean;
  /** Render a textarea instead of an input. */
  multiline?: boolean;
}

/** Texts the widget writes itself. `{service}` is replaced by the service label. */
export interface Strings {
  /** aria-label and title of each button. Default "Ask {service}". */
  ask?: string;
  /** aria-label of the built-in question field. Default "Your question". */
  question?: string;
  /** Hint announced after the prompt was copied to the clipboard. Default "Prompt copied — paste it into {service}". */
  copied?: string;
  /** Default trigger text of the `menu` layout when no `label` is set. Default "Ask AI". */
  menu?: string;
}

export type Variant = "soft" | "outline" | "solid" | "ghost" | "brand" | (string & {});
export type Shape = "circle" | "rounded" | "square";
export type Size = "sm" | "md" | "lg";
export type Theme = "light" | "dark" | "auto";

export interface AskAIOptions {
  /** Service keys and/or inline service definitions. Default: all built-ins in order. */
  services?: Array<ServiceKey | ServiceDef>;
  /** The ask. Default: "{question}" when `input` is on, otherwise "Explain this page." */
  prompt?: PromptPart;
  /** Custom instructions placed before the prompt. */
  instructions?: PromptPart;
  /** Page context placed after the prompt. Default "Context: {title} — {url}". false disables it. */
  context?: PromptPart | false;
  /**
   * Source URLs the agent should read (e.g. "/llms.txt", "/docs/api"). Relative URLs resolve against the page.
   * Rendered as the `{references}` part: "Use these sources:\n- https://…".
   */
  references?: string[] | ((ctx: PromptContext) => string[]);
  /** How parts are joined. Default "{instructions}\n\n{prompt}\n\n{context}\n\n{references}". */
  template?: string;
  /**
   * Override the detected page values. Pass these when rendering on the server (Next.js, Nuxt, SvelteKit) so the
   * server-rendered hrefs equal what the client computes and hydration matches, e.g.
   * `page={{ url: "https://example.com/docs/api", title: "API reference" }}`. Each field falls back to the
   * live `location.href`, `document.title` and `<meta name="description">` when omitted. Also used as the base
   * for relative `references`.
   */
  page?: { url?: string; title?: string; description?: string };
  /** Extra template variables. */
  vars?: Record<string, string>;
  /** Text next to the buttons, e.g. "Ask AI about this page". See `labelPosition`. */
  label?: string;
  /**
   * Where the visible `label` goes: "left" (default), "top", "right", "bottom", or "none" (no visible text; the label is
   * still the accessible name of the button group). Ignored by the menu layout, where the label is the trigger text.
   */
  labelPosition?: "left" | "top" | "right" | "bottom" | "none";
  variant?: Variant;
  shape?: Shape;
  size?: Size;
  theme?: Theme;
  /**
   * `row` (default): one button per service. `menu`: a single "Ask AI" trigger button that opens a dropdown menu
   * listing every service (logo + name); choosing one behaves exactly like clicking its button in the row.
   * In the menu layout `label` is the trigger text (default `strings.menu`, "Ask AI").
   */
  layout?: "row" | "menu";
  /** Menu layout: which edge of the trigger the dropdown lines up with. Default "start". */
  menuAlign?: "start" | "end";
  /** Menu layout: show the first services' logos as an overlapping stack inside the trigger ("stack", default) or only the label ("none"). */
  menuIcons?: "stack" | "none";
  /** Show the service name next to each logo. */
  showLabels?: boolean;
  /** Skip injecting default CSS. */
  unstyled?: boolean;
  /**
   * Max prompt length in characters (default 4000). When the prompt is too long it shrinks in this order:
   * context (ellipsis) -> references (whole lines) -> instructions (ellipsis) -> prompt, which is hard-clipped last.
   */
  maxLength?: number;
  /**
   * Let users type a question: `true` / options renders a built-in field; a selector or element binds an existing
   * one, optionally with options: `{ target: "#q", required: false }`.
   */
  input?: boolean | InputOptions | string | HTMLInputElement | HTMLTextAreaElement;
  /** Translate the widget's own texts (button labels, input label, "copied" hint). `{service}` = the service label. */
  strings?: Strings;
  /** Service opened when Enter is pressed in the input. Default: the first service. */
  submitService?: string;
  /** Extra class names on the root element. */
  className?: string;
  /** Called right before a service opens. */
  onOpen?: (detail: OpenDetail) => void;
}

export interface OpenDetail {
  service: string;
  prompt: string;
  url: string;
}

/** A pre-computed button, shared by every renderer (vanilla, React, Vue, SSR). */
export interface Item {
  key: string;
  label: string;
  href: string;
  icon?: string;
  color?: string;
  prefill: boolean;
}

export interface Instance {
  element: HTMLElement;
  update(options: Partial<AskAIOptions>): void;
  destroy(): void;
}

/**
 * Options of the `lite` entries. Same as `AskAIOptions`, but `services` documents the real rule: a string only
 * resolves after `registerService()`; otherwise pass the objects from `ask-ai-widget/services`.
 */
export interface LiteAskAIOptions extends Omit<AskAIOptions, "services"> {
  /** Service objects (`import { claude } from "ask-ai-widget/services"`). Strings work only if registered with `registerService()`. */
  services?: Array<ServiceDef | string>;
}
