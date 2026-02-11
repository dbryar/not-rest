export interface Chunk {
  offset: number;
  data: string;
  checksum: string;
  checksumPrevious: string | null;
  state: "partial" | "complete";
  cursor: string | null;
}

export interface OperationInstance {
  requestId: string;
  op: string;
  state: "accepted" | "pending" | "complete" | "error";
  result?: unknown;
  error?: { code: string; message: string };
  retryAfterMs: number;
  createdAt: number;
  expiresAt: number;
  chunks?: Chunk[];
}

let operationInstances = new Map<string, OperationInstance>();

export function createInstance(requestId: string, op: string): OperationInstance {
  const instance: OperationInstance = {
    requestId,
    op,
    state: "accepted",
    retryAfterMs: 100,
    createdAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  operationInstances.set(requestId, instance);
  return instance;
}

export function transitionTo(
  requestId: string,
  state: OperationInstance["state"],
  data?: { result?: unknown; error?: { code: string; message: string }; chunks?: Chunk[] },
): OperationInstance | null {
  const instance = operationInstances.get(requestId);
  if (!instance) return null;
  instance.state = state;
  if (data?.result !== undefined) instance.result = data.result;
  if (data?.error) instance.error = data.error;
  if (data?.chunks) instance.chunks = data.chunks;
  return instance;
}

export function getInstance(requestId: string): OperationInstance | null {
  return operationInstances.get(requestId) || null;
}

export function resetInstances(): void {
  operationInstances = new Map();
}

export function computeSha256(data: string): string {
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(data);
  return `sha256:${hash.digest("hex")}`;
}

export function buildChunks(data: string, chunkSize: number = 512): Chunk[] {
  const chunks: Chunk[] = [];
  let offset = 0;
  let previousChecksum: string | null = null;

  while (offset < data.length) {
    const end = Math.min(offset + chunkSize, data.length);
    const chunkData = data.slice(offset, end);
    const checksum = computeSha256(chunkData);
    const isLast = end >= data.length;
    const cursor = isLast ? null : btoa(String(end));

    chunks.push({
      offset,
      data: chunkData,
      checksum,
      checksumPrevious: previousChecksum,
      state: isLast ? "complete" : "partial",
      cursor,
    });

    previousChecksum = checksum;
    offset = end;
  }

  return chunks;
}
