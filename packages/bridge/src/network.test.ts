import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickPreferredUrl, getLanAddresses } from "./network.js";

describe("network helpers", () => {
  it("prefers tailnet DNS when present", () => {
    const preferred = pickPreferredUrl([
      "https://127.0.0.1:7420",
      "https://192.168.1.5:7420",
      "https://devbox.tail123.ts.net:7420",
    ]);
    assert.equal(preferred, "https://devbox.tail123.ts.net:7420");
  });

  it("lists lan addresses without throwing", () => {
    const addrs = getLanAddresses();
    assert.ok(Array.isArray(addrs));
  });
});
