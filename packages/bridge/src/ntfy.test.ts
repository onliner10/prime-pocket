import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publishNtfy } from "./ntfy.js";

describe("ntfy", () => {
  it("posts to the configured server", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    try {
      await publishNtfy({
        topic: "pocket-test",
        title: "Hello",
        message: "World",
        server: "https://ntfy.example",
        tags: ["robot"],
      });
      assert.equal(calls.length, 1);
      assert.equal(calls[0]!.url, "https://ntfy.example/pocket-test");
      assert.equal(calls[0]!.init.method, "POST");
      assert.equal(calls[0]!.init.body, "World");
    } finally {
      globalThis.fetch = original;
    }
  });
});
