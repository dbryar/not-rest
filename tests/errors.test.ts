import { describe, expect, test } from "bun:test";
import { call, API_URL } from "./helpers/client";

describe("Error Handling (REQ-ERR)", () => {
  test("unknown operation returns 400 with UNKNOWN_OP", async () => {
    const { status, body } = await call("v1:nonexistent.op", {});
    expect(status).toBe(400);
    expect(body.state).toBe("error");
    expect(body.error!.code).toBe("UNKNOWN_OP");
  });

  test("missing op field returns 400", async () => {
    const res = await fetch(`${API_URL}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args: {} }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.state).toBe("error");
  });

  test("missing required arg returns 400 with VALIDATION_ERROR", async () => {
    const { status, body } = await call("v1:todos.create", {});
    expect(status).toBe(400);
    expect(body.state).toBe("error");
    expect(body.error!.code).toBe("VALIDATION_ERROR");
  });

  test("wrong arg type returns 400 with VALIDATION_ERROR", async () => {
    const { status, body } = await call("v1:todos.create", { title: 123 });
    expect(status).toBe(400);
    expect(body.state).toBe("error");
    expect(body.error!.code).toBe("VALIDATION_ERROR");
  });

  test("domain error returns 200 with state=error", async () => {
    const { status, body } = await call("v1:todos.get", {
      id: "nonexistent-id",
    });
    expect(status).toBe(200);
    expect(body.state).toBe("error");
  });

  test("error object always has code and message", async () => {
    const { body } = await call("v1:nonexistent.op", {});
    expect(typeof body.error!.code).toBe("string");
    expect(typeof body.error!.message).toBe("string");
    expect(body.error!.code.length).toBeGreaterThan(0);
    expect(body.error!.message.length).toBeGreaterThan(0);
  });

  test("GET /call returns 405 Method Not Allowed", async () => {
    const res = await fetch(`${API_URL}/call`);
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    const body = await res.json();
    expect(body.state).toBe("error");
    expect(body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  test("invalid JSON body returns 400", async () => {
    const res = await fetch(`${API_URL}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json {{{",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.state).toBe("error");
  });
});
