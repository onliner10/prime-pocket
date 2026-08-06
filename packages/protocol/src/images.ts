/** Allowed image MIME types for phone↔agent sharing (no SVG — XSS when opened in browser). */
export const ALLOWED_IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
] as const;

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

export const MAX_PROMPT_IMAGES = 8;
/** Per-image decoded size cap (bytes). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Max JSON body size for bridge HTTP requests (bytes). */
export const MAX_HTTP_BODY_BYTES = 24 * 1024 * 1024;

export function normalizeImageMime(mimeType: unknown): string | null {
  if (typeof mimeType !== "string") return null;
  const normalized = mimeType.trim().toLowerCase();
  if (normalized === "image/jpg") return "image/jpeg";
  return normalized || null;
}

/** True for allowlisted raster image MIME types (case-insensitive). */
export function isImageMime(mimeType: unknown): boolean {
  const mime = normalizeImageMime(mimeType);
  if (!mime) return false;
  return (ALLOWED_IMAGE_MIMES as readonly string[]).includes(mime);
}

/**
 * Strip a `data:*;base64,` prefix if present. Returns null when empty after strip.
 */
export function normalizeImageBase64(data: unknown): string | null {
  if (typeof data !== "string") return null;
  let s = data.trim();
  if (!s) return null;
  const dataUrl = /^data:[^;,]+;base64,/i.exec(s);
  if (dataUrl) s = s.slice(dataUrl[0].length);
  s = s.replace(/\s+/g, "");
  return s || null;
}

/** Safe single-line filename for Content-Disposition (no quotes/CRLF/path). */
export function sanitizeArtifactFilename(name: unknown, fallback = "image.bin"): string {
  const raw = typeof name === "string" ? name : "";
  const base = raw
    .replace(/[\r\n\0"]/g, "")
    .replace(/[/\\]/g, "_")
    .trim()
    .slice(0, 120);
  return base || fallback;
}

export interface PromptImageInput {
  mimeType?: unknown;
  dataBase64?: unknown;
  name?: unknown;
}

export type ValidatedPromptImage = {
  mimeType: string;
  dataBase64: string;
  name?: string;
  /** Decoded byte length (validated ≤ MAX_IMAGE_BYTES). */
  byteLength: number;
};

export type ValidatePromptImagesResult =
  | { ok: true; images: ValidatedPromptImage[] }
  | { ok: false; error: string; code: string };

/**
 * Validate and normalize prompt/follow-up image attachments.
 * Empty array is ok (caller decides whether message is required).
 */
export function validatePromptImages(images: unknown): ValidatePromptImagesResult {
  if (images == null) return { ok: true, images: [] };
  if (!Array.isArray(images)) {
    return { ok: false, error: "images must be an array", code: "bad_images" };
  }
  if (images.length > MAX_PROMPT_IMAGES) {
    return {
      ok: false,
      error: `at most ${MAX_PROMPT_IMAGES} images allowed`,
      code: "too_many_images",
    };
  }

  const out: ValidatedPromptImage[] = [];
  for (let i = 0; i < images.length; i++) {
    const item = images[i] as PromptImageInput | null;
    if (!item || typeof item !== "object") {
      return { ok: false, error: `images[${i}] is invalid`, code: "bad_images" };
    }
    const mime = normalizeImageMime(item.mimeType);
    if (!mime || !isImageMime(mime)) {
      return {
        ok: false,
        error: `images[${i}] has unsupported mime type`,
        code: "bad_image_mime",
      };
    }
    const dataBase64 = normalizeImageBase64(item.dataBase64);
    if (!dataBase64) {
      return { ok: false, error: `images[${i}] is empty`, code: "bad_image_data" };
    }
    // Approximate decoded size without allocating a full Buffer in the protocol package.
    const padding = dataBase64.endsWith("==") ? 2 : dataBase64.endsWith("=") ? 1 : 0;
    const byteLength = Math.floor((dataBase64.length * 3) / 4) - padding;
    if (byteLength <= 0) {
      return { ok: false, error: `images[${i}] is empty`, code: "bad_image_data" };
    }
    if (byteLength > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        error: `images[${i}] exceeds ${MAX_IMAGE_BYTES} bytes`,
        code: "image_too_large",
      };
    }
    const name =
      item.name != null ? sanitizeArtifactFilename(item.name, `upload-${i + 1}`) : undefined;
    out.push({ mimeType: mime, dataBase64, name, byteLength });
  }
  return { ok: true, images: out };
}
