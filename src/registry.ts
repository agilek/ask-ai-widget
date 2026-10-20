import type { ServiceDef, ServiceKey } from "./types";

/** Services added with `registerService`. Empty until you register something; the built-ins live in `ask-ai-widget/services`. */
export const registry: Record<string, ServiceDef> = Object.create(null);

/** Add or override a service. */
export function registerService(d: ServiceDef): void {
  registry[d.key.toLowerCase()] = d;
}

/** Registered keys (case-insensitive) and/or inline defs -> defs. Unknown keys are dropped with a warning. */
export function resolveServices(list?: Array<ServiceKey | ServiceDef>): ServiceDef[] {
  const out: ServiceDef[] = [];
  for (const s of list || Object.keys(registry)) {
    const d = typeof s === "string" ? registry[s.toLowerCase()] : s;
    if (d) out.push(d);
    else console.warn(`[ask-ai] unknown service "${s}"`);
  }
  return out;
}
