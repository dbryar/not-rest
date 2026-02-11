import { describe, expect, test } from "bun:test";
import { call, API_URL, getRegistry } from "./helpers/client";
import { validTodo } from "./helpers/fixtures";

async function callMultipart(
  op: string,
  args: Record<string, unknown>,
  file: { data: Uint8Array; contentType: string; filename: string },
  token?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const formData = new FormData();
  formData.append("envelope", JSON.stringify({ op, args }));
  const blob = new Blob([file.data], { type: file.contentType });
  formData.append("file", blob, file.filename);

  const headers: Record<string, string> = {};
  if (token || process.env.AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${token || process.env.AUTH_TOKEN}`;
  }

  const res = await fetch(`${API_URL}/call`, {
    method: "POST",
    headers,
    body: formData,
  });
  const body = await res.json();
  return { status: res.status, body };
}

describe("Media Handling (REQ-MEDIA)", () => {
  test("v1:todos.attach with multipart/form-data returns state=complete", async () => {
    const { body: created } = await call("v1:todos.create", validTodo());
    const todoId = (created.result as { id: string }).id;

    const file = {
      data: new TextEncoder().encode("Hello, world!"),
      contentType: "text/plain",
      filename: "test.txt",
    };

    const { status, body } = await callMultipart(
      "v1:todos.attach",
      { todoId },
      file,
    );
    expect(status).toBe(200);
    expect(body.state).toBe("complete");
  });

  test("successful attach includes attachmentId in result", async () => {
    const { body: created } = await call("v1:todos.create", validTodo());
    const todoId = (created.result as { id: string }).id;

    const file = {
      data: new TextEncoder().encode("attachment content"),
      contentType: "text/plain",
      filename: "doc.txt",
    };

    const { body } = await callMultipart("v1:todos.attach", { todoId }, file);
    const result = body.result as { attachmentId: string };
    expect(result.attachmentId).toBeTruthy();
  });

  test("todo with attachment includes location object", async () => {
    const { body: created } = await call("v1:todos.create", validTodo());
    const todoId = (created.result as { id: string }).id;

    const file = {
      data: new TextEncoder().encode("location test"),
      contentType: "text/plain",
      filename: "loc.txt",
    };
    await callMultipart("v1:todos.attach", { todoId }, file);

    const { body: got } = await call("v1:todos.get", { id: todoId });
    const result = got.result as { location?: { uri: string } };
    expect(result.location).toBeDefined();
    expect(result.location!.uri).toContain("/media/");
  });

  test("location.uri points to /media/{id} path", async () => {
    const { body: created } = await call("v1:todos.create", validTodo());
    const todoId = (created.result as { id: string }).id;

    const file = {
      data: new TextEncoder().encode("uri test"),
      contentType: "text/plain",
      filename: "uri.txt",
    };
    await callMultipart("v1:todos.attach", { todoId }, file);

    const { body: got } = await call("v1:todos.get", { id: todoId });
    const result = got.result as { location: { uri: string } };
    expect(result.location.uri).toMatch(/^\/media\/[a-f0-9-]+$/);
  });

  test("GET /media/{id} returns HTTP 303 with Location header", async () => {
    const { body: created } = await call("v1:todos.create", validTodo());
    const todoId = (created.result as { id: string }).id;

    const file = {
      data: new TextEncoder().encode("redirect test"),
      contentType: "text/plain",
      filename: "redir.txt",
    };
    const { body: attached } = await callMultipart("v1:todos.attach", { todoId }, file);
    const attachmentId = (attached.result as { attachmentId: string }).attachmentId;

    const res = await fetch(`${API_URL}/media/${attachmentId}`, { redirect: "manual" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBeTruthy();
  });

  test("following 303 redirect returns binary data with correct Content-Type", async () => {
    const { body: created } = await call("v1:todos.create", validTodo());
    const todoId = (created.result as { id: string }).id;

    const content = "binary content test";
    const file = {
      data: new TextEncoder().encode(content),
      contentType: "text/plain",
      filename: "binary.txt",
    };
    const { body: attached } = await callMultipart("v1:todos.attach", { todoId }, file);
    const attachmentId = (attached.result as { attachmentId: string }).attachmentId;

    // Follow the redirect manually
    const redirectRes = await fetch(`${API_URL}/media/${attachmentId}`, { redirect: "manual" });
    const location = redirectRes.headers.get("location")!;
    const dataRes = await fetch(`${API_URL}${location}`);
    expect(dataRes.status).toBe(200);
    expect(dataRes.headers.get("content-type")).toContain("text/plain");
    const text = await dataRes.text();
    expect(text).toBe(content);
  });

  test("registry declares mediaSchema for v1:todos.attach", async () => {
    const { body } = await getRegistry();
    const attach = body.operations.find((o) => o.op === "v1:todos.attach");
    expect(attach).toBeDefined();
    expect(attach!.mediaSchema).toBeDefined();
    const ms = attach!.mediaSchema as { name: string; acceptedTypes: string[]; maxBytes: number };
    expect(ms.name).toBeTruthy();
    expect(ms.acceptedTypes).toBeInstanceOf(Array);
    expect(ms.maxBytes).toBeGreaterThan(0);
  });

  test("v1:todos.attach with ref URI succeeds", async () => {
    const { body: created } = await call("v1:todos.create", validTodo());
    const todoId = (created.result as { id: string }).id;

    const { status, body } = await call("v1:todos.attach", {
      todoId,
      ref: "https://example.com/document.pdf",
    });
    expect(status).toBe(200);
    expect(body.state).toBe("complete");
  });

  test("v1:todos.attach with unsupported MIME type returns error", async () => {
    const { body: created } = await call("v1:todos.create", validTodo());
    const todoId = (created.result as { id: string }).id;

    const file = {
      data: new TextEncoder().encode("bad type"),
      contentType: "application/x-executable",
      filename: "virus.exe",
    };
    const { status, body } = await callMultipart("v1:todos.attach", { todoId }, file);
    expect(status).toBe(200);
    expect(body.state).toBe("error");
    expect((body.error as { code: string }).code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });
});
