import { describe, expect, test } from "bun:test";
import { call } from "./helpers/client";
import { pollOperation } from "./helpers/async";

describe("Status Codes (REQ-STATUS)", () => {
  test("HTTP 500 includes full error payload with code and message", async () => {
    const { status, body } = await call("v1:debug.simulateError", {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      message: "Something went wrong internally",
    });
    expect(status).toBe(500);
    expect(body.state).toBe("error");
    expect(body.error!.code).toBe("INTERNAL_ERROR");
    expect(body.error!.message).toBeTruthy();
  });

  test("HTTP 500 error.code is a non-empty string", async () => {
    const { body } = await call("v1:debug.simulateError", {
      statusCode: 500,
      code: "SERVER_FAILURE",
      message: "Failure",
    });
    expect(body.error!.code).toBeTruthy();
    expect(typeof body.error!.code).toBe("string");
  });

  test("polling nonexistent requestId returns HTTP 404", async () => {
    const poll = await pollOperation("does-not-exist-999");
    expect(poll.status).toBe(404);
  });

  test("HTTP 404 response includes error payload with code and message", async () => {
    const poll = await pollOperation("does-not-exist-999");
    expect(poll.body.state).toBe("error");
    expect(poll.body.error!.code).toBeTruthy();
    expect(poll.body.error!.message).toBeTruthy();
  });

  test("HTTP 502 response includes error payload", async () => {
    const { status, body } = await call("v1:debug.simulateError", {
      statusCode: 502,
      code: "UPSTREAM_ERROR",
      message: "Upstream dependency failed",
    });
    expect(status).toBe(502);
    expect(body.state).toBe("error");
    expect(body.error!.code).toBe("UPSTREAM_ERROR");
  });

  test("HTTP 503 response includes error payload", async () => {
    const { status, body } = await call("v1:debug.simulateError", {
      statusCode: 503,
      code: "SERVICE_UNAVAILABLE",
      message: "Server is temporarily unavailable",
    });
    expect(status).toBe(503);
    expect(body.state).toBe("error");
    expect(body.error!.code).toBe("SERVICE_UNAVAILABLE");
  });

  test("all error responses include requestId", async () => {
    // Test a variety of error status codes
    const tests = [
      call("v1:debug.simulateError", { statusCode: 500, code: "ERR", message: "test" }),
      call("v1:debug.simulateError", { statusCode: 502, code: "ERR", message: "test" }),
      call("v1:debug.simulateError", { statusCode: 503, code: "ERR", message: "test" }),
      call("v1:todos.search", { query: "test" }), // 410
      call("no.such.op"), // 400
    ];
    const results = await Promise.all(tests);
    for (const { body } of results) {
      expect(body.requestId).toBeTruthy();
    }
  });
});
