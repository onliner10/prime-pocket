import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isImageMime,
  normalizeImageBase64,
  normalizeImageMime,
  sanitizeArtifactFilename,
  validatePromptImages,
  MAX_PROMPT_IMAGES,
} from "./images.js";

describe("isImageMime", () => {
  it("accepts allowlisted types case-insensitively", () => {
    assert.equal(isImageMime("image/png"), true);
    assert.equal(isImageMime("Image/PNG"), true);
    assert.equal(isImageMime(" image/jpeg "), true);
    assert.equal(isImageMime("image/jpg"), true);
    assert.equal(isImageMime("image/webp"), true);
    assert.equal(isImageMime("image/gif"), true);
  });

  it("rejects svg, empty, and non-strings", () => {
    assert.equal(isImageMime("image/svg+xml"), false);
    assert.equal(isImageMime("image/"), false);
    assert.equal(isImageMime("text/plain"), false);
    assert.equal(isImageMime(""), false);
    assert.equal(isImageMime(undefined), false);
    assert.equal(isImageMime(null), false);
  });
});

describe("normalizeImageBase64", () => {
  it("strips data URL prefix and whitespace", () => {
    assert.equal(normalizeImageBase64("data:image/png;base64,abc123"), "abc123");
    assert.equal(normalizeImageBase64(" ab c "), "abc");
  });

  it("rejects empty", () => {
    assert.equal(normalizeImageBase64(""), null);
    assert.equal(normalizeImageBase64("data:image/png;base64,"), null);
    assert.equal(normalizeImageBase64(null), null);
  });
});

describe("sanitizeArtifactFilename", () => {
  it("strips quotes, paths, and newlines", () => {
    assert.equal(sanitizeArtifactFilename('evil"\r\nname.png'), "evilname.png");
    assert.equal(sanitizeArtifactFilename("../../etc/passwd"), ".._.._etc_passwd");
    assert.equal(sanitizeArtifactFilename(""), "image.bin");
  });
});

describe("validatePromptImages", () => {
  const tiny = Buffer.from([0x89, 0x50]).toString("base64");

  it("accepts empty / null", () => {
    assert.deepEqual(validatePromptImages(null), { ok: true, images: [] });
    assert.deepEqual(validatePromptImages(undefined), { ok: true, images: [] });
    assert.deepEqual(validatePromptImages([]), { ok: true, images: [] });
  });

  it("normalizes mime and data URL", () => {
    const res = validatePromptImages([
      { mimeType: "Image/JPG", dataBase64: `data:image/jpeg;base64,${tiny}`, name: "a.jpg" },
    ]);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.images[0]!.mimeType, "image/jpeg");
      assert.equal(res.images[0]!.dataBase64, tiny);
    }
  });

  it("rejects svg and empty base64", () => {
    assert.equal(
      validatePromptImages([{ mimeType: "image/svg+xml", dataBase64: tiny }]).ok,
      false,
    );
    assert.equal(validatePromptImages([{ mimeType: "image/png", dataBase64: "" }]).ok, false);
    assert.equal(validatePromptImages([{ mimeType: "image/png" }]).ok, false);
  });

  it("rejects too many images", () => {
    const many = Array.from({ length: MAX_PROMPT_IMAGES + 1 }, () => ({
      mimeType: "image/png",
      dataBase64: tiny,
    }));
    const res = validatePromptImages(many);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, "too_many_images");
  });

  it("rejects non-array", () => {
    assert.equal(validatePromptImages({}).ok, false);
  });
});

describe("normalizeImageMime", () => {
  it("maps jpg → jpeg", () => {
    assert.equal(normalizeImageMime("image/jpg"), "image/jpeg");
  });
});
