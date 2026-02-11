import { describe, expect, test } from "bun:test";
import { call, API_URL, getRegistry } from "./helpers/client";
import { validTodo } from "./helpers/fixtures";

describe("Streaming (REQ-STREAM)", () => {
  test("v1:todos.watch returns HTTP 202 with state=streaming", async () => {
    const { status, body } = await call("v1:todos.watch", {});
    expect(status).toBe(202);
    expect(body.state).toBe("streaming");
  });

  test("streaming response includes stream object with transport, location, sessionId", async () => {
    const { body } = await call("v1:todos.watch", {});
    expect(body.stream).toBeDefined();
    expect(body.stream!.transport).toBeTruthy();
    expect(body.stream!.location).toBeTruthy();
    expect(body.stream!.sessionId).toBeTruthy();
  });

  test("stream.transport is wss", async () => {
    const { body } = await call("v1:todos.watch", {});
    expect(body.stream!.transport).toBe("wss");
  });

  test("streaming response includes stream.expiresAt as Unix epoch seconds", async () => {
    const { body } = await call("v1:todos.watch", {});
    expect(body.stream).toBeDefined();
    expect(typeof body.stream!.expiresAt).toBe("number");
    expect(body.stream!.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  test("stream.encoding is json", async () => {
    const { body } = await call("v1:todos.watch", {});
    expect(body.stream!.encoding).toBe("json");
  });

  test("WebSocket connection is established at stream.location", async () => {
    const { body } = await call("v1:todos.watch", {});
    const wsUrl = `ws://${new URL(API_URL).host}${body.stream!.location}`;

    const connected = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.close();
        resolve(true);
      };
      ws.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 2000);
    });

    expect(connected).toBe(true);
  });

  test("creating a todo pushes a change event on active WebSocket", async () => {
    const { body: watchBody } = await call("v1:todos.watch", {});
    const wsUrl = `ws://${new URL(API_URL).host}${watchBody.stream!.location}`;

    const event = await new Promise<Record<string, unknown> | null>((resolve) => {
      const ws = new WebSocket(wsUrl);
      ws.onopen = async () => {
        // Create a todo after the WebSocket is connected
        await call("v1:todos.create", validTodo({ title: "Stream Create Test" }));
      };
      ws.onmessage = (msg) => {
        ws.close();
        resolve(JSON.parse(msg.data as string));
      };
      setTimeout(() => {
        ws.close();
        resolve(null);
      }, 3000);
    });

    expect(event).not.toBeNull();
    expect(event!.event).toBe("created");
    const todo = event!.todo as { title: string };
    expect(todo.title).toBe("Stream Create Test");
  });

  test("updating a todo pushes an updated event on active WebSocket", async () => {
    // Create a todo first
    const { body: created } = await call("v1:todos.create", validTodo({ title: "Stream Update Test" }));
    const todoId = (created.result as { id: string }).id;

    const { body: watchBody } = await call("v1:todos.watch", {});
    const wsUrl = `ws://${new URL(API_URL).host}${watchBody.stream!.location}`;

    const event = await new Promise<Record<string, unknown> | null>((resolve) => {
      const ws = new WebSocket(wsUrl);
      ws.onopen = async () => {
        await call("v1:todos.update", { id: todoId, title: "Updated Stream Title" });
      };
      ws.onmessage = (msg) => {
        ws.close();
        resolve(JSON.parse(msg.data as string));
      };
      setTimeout(() => {
        ws.close();
        resolve(null);
      }, 3000);
    });

    expect(event).not.toBeNull();
    expect(event!.event).toBe("updated");
  });

  test("registry declares v1:todos.watch with stream executionModel and transports", async () => {
    const { body } = await getRegistry();
    const watch = body.operations.find((o) => o.op === "v1:todos.watch");
    expect(watch).toBeDefined();
    expect(watch!.executionModel).toBe("stream");
    expect(watch!.supportedTransports).toContain("wss");
  });
});
