import type { PairingQrPayload } from "./types.js";

export function encodePairingQr(payload: PairingQrPayload): string {
  return `prime-pocket://pair?data=${encodeURIComponent(JSON.stringify(payload))}`;
}

export function decodePairingQr(raw: string): PairingQrPayload {
  const trimmed = raw.trim();
  let json: string;
  if (trimmed.startsWith("prime-pocket://pair")) {
    const url = new URL(trimmed);
    const data = url.searchParams.get("data");
    if (!data) throw new Error("Missing pairing data");
    json = data;
  } else if (trimmed.startsWith("{")) {
    json = trimmed;
  } else {
    throw new Error("Unrecognized pairing QR payload");
  }
  const parsed = JSON.parse(json) as PairingQrPayload;
  if (parsed.v !== 1 || !parsed.url || !parsed.pairCode || !parsed.fingerprint) {
    throw new Error("Invalid pairing payload");
  }
  return parsed;
}
