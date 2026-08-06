import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BridgeStore } from "./store.js";

describe("BridgeStore disk sync", () => {
  it("picks up pair codes rotated by another process", () => {
    const dir = mkdtempSync(join(tmpdir(), "pocket-store-"));
    try {
      const live = new BridgeStore(dir, "sync-host");
      const oldCode = live.data.pairCode;

      const cli = new BridgeStore(dir, "sync-host");
      const newCode = cli.rotatePairCode();
      assert.notEqual(newCode, oldCode);

      assert.equal(live.pairCodeValid(oldCode), false);
      assert.equal(live.pairCodeValid(newCode), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
