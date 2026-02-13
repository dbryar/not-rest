import { z } from "zod/v4";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { Glob } from "bun";

// ── Types ───────────────────────────────────────────────────────────────

export interface RegistryEntry {
  op: string;
  argsSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
  sideEffecting: boolean;
  idempotencyRequired: boolean;
  executionModel: "sync" | "async";
  maxSyncMs: number;
  ttlSeconds: number;
  authScopes: string[];
  cachingPolicy: "none" | "server" | "location";
  deprecated?: boolean;
  sunset?: string;
  replacement?: string;
}

export interface RegistryResponse {
  callVersion: string;
  operations: RegistryEntry[];
}

// ── Cached state ────────────────────────────────────────────────────────

let cachedRegistry: RegistryResponse | null = null;
let cachedETag: string | null = null;
let cachedJson: string | null = null;

// Store resolved operation modules for the dispatcher
const operationModules = new Map<
  string,
  { args: z.ZodType; result: z.ZodType; handler: Function }
>();

/** Retrieve the map of operation name -> module (args, result, handler) */
export function getOperationModules() {
  return operationModules;
}

/** Retrieve the cached registry entries (empty array if not yet built) */
export function getRegistryEntries(): RegistryEntry[] {
  return cachedRegistry?.operations ?? [];
}

// ── JSDoc parser ────────────────────────────────────────────────────────

/**
 * Extracts JSDoc tags from the first JSDoc block found in a source file.
 *
 * Returns a record mapping tag names to their accumulated values. For tags
 * that can appear multiple times (e.g. @security), values are joined with
 * spaces so they can be split later.
 *
 * Example input:
 *   /** @op v1:catalog.list
 *    *  @flags sideEffecting
 *    *  @execution sync
 *    *  @timeout 5000
 *    *  @security items:browse
 *    *  @security items:read
 *    *\/
 *
 * Returns:
 *   { op: "v1:catalog.list", flags: "sideEffecting", execution: "sync",
 *     timeout: "5000", security: "items:browse items:read" }
 */
function parseJSDoc(sourceText: string): Record<string, string> {
  // Match the first JSDoc block in the file: /** ... */
  const jsdocMatch = sourceText.match(/\/\*\*[\s\S]*?\*\//);
  if (!jsdocMatch) return {};

  const block = jsdocMatch[0];
  const tags: Record<string, string> = {};

  // Match every @tag with its value (rest of the line after the tag name).
  // Handles lines like: " * @op v1:catalog.list" or "@flags sideEffecting"
  const tagPattern = /@(\w+)\s+(.*?)(?:\s*\*\/|\s*$)/gm;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(block)) !== null) {
    const tagName = match[1]!;
    const tagValue = match[2]!.replace(/\s*\*?\s*$/, "").trim();

    if (tagName in tags) {
      // Accumulate multiple occurrences (e.g. multiple @security lines)
      tags[tagName] = `${tags[tagName]} ${tagValue}`;
    } else {
      tags[tagName] = tagValue;
    }
  }

  return tags;
}

// ── Registry builder ────────────────────────────────────────────────────

/** Scan operation files, import modules, parse JSDoc, and build the registry */
export async function buildRegistry(): Promise<RegistryResponse> {
  const opsDir = join(
    dirname(new URL(import.meta.url).pathname),
    "..",
    "operations"
  );
  const glob = new Glob("*.ts");
  const entries: RegistryEntry[] = [];

  for await (const file of glob.scan(opsDir)) {
    const filePath = join(opsDir, file);
    const sourceText = readFileSync(filePath, "utf-8");
    const tags = parseJSDoc(sourceText);

    // Skip files that don't declare an @op tag
    if (!tags["op"]) continue;

    const mod = await import(filePath);

    // Store the module for the dispatcher to use later
    const opModule: { args: z.ZodType; result: z.ZodType; handler: Function; sunset?: string; replacement?: string } = {
      args: mod.args,
      result: mod.result,
      handler: mod.handler,
    };
    if (tags["sunset"]) opModule.sunset = tags["sunset"];
    if (tags["replacement"]) opModule.replacement = tags["replacement"];
    operationModules.set(tags["op"], opModule);

    const entry: RegistryEntry = {
      op: tags["op"],
      argsSchema: z.toJSONSchema(mod.args),
      resultSchema: z.toJSONSchema(mod.result),
      sideEffecting: tags["flags"]?.includes("sideEffecting") ?? false,
      idempotencyRequired:
        tags["flags"]?.includes("idempotencyRequired") ?? false,
      executionModel:
        (tags["execution"] as "sync" | "async") ?? "sync",
      maxSyncMs: tags["timeout"] ? parseInt(tags["timeout"], 10) : 5000,
      ttlSeconds: tags["ttl"] ? parseInt(tags["ttl"], 10) : 0,
      authScopes: tags["security"] ? tags["security"].split(/\s+/) : [],
      cachingPolicy:
        (tags["cache"] as "none" | "server" | "location") ?? "none",
    };

    // Only include deprecated when explicitly flagged
    if (tags["flags"]?.includes("deprecated")) {
      entry.deprecated = true;
    }
    if (tags["sunset"]) entry.sunset = tags["sunset"];
    if (tags["replacement"]) entry.replacement = tags["replacement"];

    entries.push(entry);
  }

  const registry: RegistryResponse = {
    callVersion: process.env.CALL_VERSION || "2026-02-10",
    operations: entries,
  };

  // Cache everything for the GET handler
  cachedRegistry = registry;
  cachedJson = JSON.stringify(registry);

  const hash = new Bun.CryptoHasher("sha256");
  hash.update(cachedJson);
  cachedETag = `"${hash.digest("hex")}"`;

  return registry;
}

// ── GET /.well-known/ops handler ────────────────────────────────────────

/** Serve the cached registry with ETag / conditional 304 support */
export function handleRegistryRequest(request: Request): Response {
  if (!cachedJson || !cachedETag) {
    return new Response(
      JSON.stringify({ error: "Registry not initialized" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Conditional GET — return 304 if the client already has current data
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch === cachedETag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: cachedETag },
    });
  }

  return new Response(cachedJson, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      ETag: cachedETag,
    },
  });
}
