import type { ServiceDef } from "./types";

export function buildUrl(s: Pick<ServiceDef, "url" | "param">, prompt: string): string {
  const sep = /[?&]$/.test(s.url) ? "" : s.url.includes("?") ? "&" : "?";
  return `${s.url}${sep}${s.param}=${encodeURIComponent(prompt)}`;
}
