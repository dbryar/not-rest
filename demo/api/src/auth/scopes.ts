/** All valid scope strings in the system */
export type Scope =
  | "items:browse"
  | "items:read"
  | "items:write"
  | "items:manage"
  | "patron:read"
  | "patron:billing"
  | "reports:generate";

/** Mapping from scope to the operations it grants access to */
export const SCOPE_TO_OPS: Record<Scope, string[]> = {
  "items:browse": ["v1:catalog.list", "v1:catalog.listLegacy"],
  "items:read": ["v1:item.get", "v1:item.getMedia"],
  "items:write": ["v1:item.reserve", "v1:item.return"],
  "items:manage": ["v1:catalog.bulkImport"],
  "patron:read": ["v1:patron.get", "v1:patron.history"],
  "patron:billing": ["v1:patron.fines"],
  "reports:generate": ["v1:report.generate"],
};

/** Inverted mapping: operation name -> required scopes */
export const OP_TO_SCOPES: Record<string, string[]> = {};

// Build OP_TO_SCOPES from SCOPE_TO_OPS
for (const [scope, ops] of Object.entries(SCOPE_TO_OPS)) {
  for (const op of ops) {
    if (!OP_TO_SCOPES[op]) {
      OP_TO_SCOPES[op] = [];
    }
    OP_TO_SCOPES[op]!.push(scope);
  }
}

/** Default scopes granted to human (demo) tokens */
export const DEFAULT_HUMAN_SCOPES: Scope[] = [
  "items:browse",
  "items:read",
  "items:write",
  "patron:read",
  "reports:generate",
];

/** Scopes granted to agent tokens */
export const AGENT_SCOPES: Scope[] = [
  "items:browse",
  "items:read",
  "items:write",
  "patron:read",
];

/** Scopes that are never auto-granted (require explicit escalation) */
export const NEVER_GRANTED: Scope[] = ["items:manage", "patron:billing"];

/** Remove any scopes from the NEVER_GRANTED list */
export function stripNeverGranted(scopes: string[]): string[] {
  const blocked = new Set<string>(NEVER_GRANTED);
  return scopes.filter((s) => !blocked.has(s));
}

/** Get the required scopes for a given operation name */
export function getRequiredScopes(op: string): string[] {
  return OP_TO_SCOPES[op] ?? [];
}
