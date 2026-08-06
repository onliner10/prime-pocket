import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareCursor,
  decodePairingQr,
  encodePairingQr,
  initialCursor,
  nextCursor,
  bumpGeneration,
} from "./index.js";
import type { PairingQrPayload } from "./index.js";

describe("cursor", () => {
  it("orders by generation then sequence", () => {
    assert.equal(compareCursor({ generation: 1, sequence: 5 }, { generation: 1, sequence: 3 }), 2);
    assert.ok(compareCursor({ generation: 2, sequence: 0 }, { generation: 1, sequence: 99 }) > 0);
  });

  it("advances sequence and generation", () => {
    const c = initialCursor();
    assert.deepEqual(nextCursor(c), { generation: 1, sequence: 1 });
    assert.deepEqual(bumpGeneration(c), { generation: 2, sequence: 0 });
  });
});

describe("pairing qr", () => {
  const payload: PairingQrPayload = {
    v: 1,
    url: "https://192.168.1.10:7420",
    urls: ["https://192.168.1.10:7420", "https://devbox.tailnet.ts.net:7420"],
    pairCode: "abc123",
    fingerprint: "deadbeef",
    hostId: "host-1",
    hostName: "devbox",
  };

  it("round-trips deep link", () => {
    const encoded = encodePairingQr(payload);
    assert.ok(encoded.startsWith("prime-pocket://pair?data="));
    assert.deepEqual(decodePairingQr(encoded), payload);
  });

  it("accepts raw json", () => {
    assert.deepEqual(decodePairingQr(JSON.stringify(payload)), payload);
  });
});
