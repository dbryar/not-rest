import { getOperationState } from "../services/lifecycle.ts";
import { reportStore } from "../services/reports.ts";

/** Maximum chunk size in bytes */
const MAX_CHUNK_SIZE = 64 * 1024; // 64KB

/**
 * Handle GET /ops/{requestId}/chunks?cursor=... — retrieve report data in chunks.
 *
 * - Returns 404 if operation not found or not in 'complete' state
 * - Slices report data into chunks of up to 64KB
 * - Each chunk has a SHA-256 checksum, chained to the previous chunk's checksum
 * - Uses cursor parameter for pagination (cursor = chunk index as string)
 * - Returns null cursor on the last chunk
 */
export async function handleChunks(
  requestId: string,
  cursor: string | null
): Promise<Response> {
  // Look up operation
  const op = getOperationState(requestId);

  if (!op) {
    return new Response(
      JSON.stringify({
        requestId,
        state: "error",
        error: {
          code: "OPERATION_NOT_FOUND",
          message: `Operation ${requestId} not found`,
        },
      }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  if (op.state !== "complete") {
    return new Response(
      JSON.stringify({
        requestId,
        state: "error",
        error: {
          code: "OPERATION_NOT_COMPLETE",
          message: `Operation is in '${op.state}' state, not 'complete'`,
        },
      }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get report data from memory store, falling back to DB
  let reportData = reportStore.get(requestId);
  if (!reportData && op.resultData) {
    reportData = op.resultData;
    // Re-populate the in-memory store
    reportStore.set(requestId, reportData);
  }

  if (!reportData) {
    return new Response(
      JSON.stringify({
        requestId,
        state: "error",
        error: {
          code: "DATA_NOT_FOUND",
          message: "Report data not found",
        },
      }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Convert report data to bytes for accurate chunking
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(reportData);
  const totalSize = dataBytes.length;

  // Calculate total number of chunks
  const totalChunks = Math.max(1, Math.ceil(totalSize / MAX_CHUNK_SIZE));

  // Determine current chunk index from cursor
  const chunkIndex = cursor !== null ? parseInt(cursor, 10) : 0;

  if (isNaN(chunkIndex) || chunkIndex < 0 || chunkIndex >= totalChunks) {
    return new Response(
      JSON.stringify({
        requestId,
        state: "error",
        error: {
          code: "INVALID_CURSOR",
          message: `Invalid cursor: ${cursor}`,
        },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Extract the chunk bytes
  const offset = chunkIndex * MAX_CHUNK_SIZE;
  const chunkBytes = dataBytes.slice(offset, offset + MAX_CHUNK_SIZE);
  const chunkLength = chunkBytes.length;

  // Decode chunk back to string for the response data field
  const decoder = new TextDecoder();
  const chunkData = decoder.decode(chunkBytes);

  // Compute SHA-256 checksum for this chunk
  const hashBuffer = await crypto.subtle.digest("SHA-256", chunkBytes);
  const checksum = `sha256:${bufferToHex(hashBuffer)}`;

  // Compute previous chunk's checksum (for chaining)
  let checksumPrevious: string | null = null;
  if (chunkIndex > 0) {
    const prevOffset = (chunkIndex - 1) * MAX_CHUNK_SIZE;
    const prevChunkBytes = dataBytes.slice(prevOffset, prevOffset + MAX_CHUNK_SIZE);
    const prevHashBuffer = await crypto.subtle.digest("SHA-256", prevChunkBytes);
    checksumPrevious = `sha256:${bufferToHex(prevHashBuffer)}`;
  }

  // Determine if this is the last chunk
  const isLastChunk = chunkIndex >= totalChunks - 1;
  const nextCursor = isLastChunk ? null : String(chunkIndex + 1);

  // Determine mime type based on the operation args
  const args = op.args as { format?: string } | undefined;
  const mimeType = args?.format === "json" ? "application/json" : "text/csv";

  return new Response(
    JSON.stringify({
      requestId,
      state: isLastChunk ? "complete" : "pending",
      checksum,
      checksumPrevious,
      offset,
      length: chunkLength,
      mimeType,
      total: totalSize,
      cursor: nextCursor,
      data: chunkData,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/** Convert an ArrayBuffer to a hex string */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}
