import type { Server } from "bun";

let server: Server | null = null;

export async function startServer(port = 3000): Promise<Server> {
  const api = await import("../api/typescript/src/index.ts");
  server = api.createServer(port);
  return server;
}

export async function stopServer(): Promise<void> {
  if (server) {
    server.stop(true);
    server = null;
  }
}
