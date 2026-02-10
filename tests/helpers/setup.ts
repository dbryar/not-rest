import { beforeAll, afterAll } from "bun:test";
import { startServer, stopServer } from "./server";
import { waitForServer } from "./client";
import { MASTER_TOKEN, registerToken } from "./auth";

if (!process.env.API_URL) {
  beforeAll(async () => {
    await startServer(3000);
    await waitForServer("http://localhost:3000");
    await registerToken(MASTER_TOKEN, [
      "todos:read",
      "todos:write",
      "reports:read",
    ]);
    process.env.AUTH_TOKEN = MASTER_TOKEN;
  });

  afterAll(async () => {
    await stopServer();
  });
}
