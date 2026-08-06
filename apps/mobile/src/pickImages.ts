import * as ImagePicker from "expo-image-picker";
import { isImageMime, MAX_PROMPT_IMAGES, normalizeImageMime } from "@prime-pocket/protocol";
import type { PendingImage } from "./components/PillComposer";

function extForMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

export async function pickImages(): Promise<PendingImage[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Photo library permission is required to share images.");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit: MAX_PROMPT_IMAGES,
    quality: 0.85,
    base64: true,
  });
  if (result.canceled) return [];

  const picked: PendingImage[] = [];
  let skipped = 0;
  for (let i = 0; i < result.assets.length; i++) {
    const a = result.assets[i]!;
    if (!a.base64) {
      skipped++;
      continue;
    }
    const mime = normalizeImageMime(a.mimeType) ?? "image/jpeg";
    if (!isImageMime(mime)) {
      skipped++;
      continue;
    }
    picked.push({
      id: `img_${Date.now()}_${i}`,
      uri: a.uri,
      mimeType: mime,
      dataBase64: a.base64,
      name: a.fileName ?? `photo-${i + 1}.${extForMime(mime)}`,
    });
  }

  if (picked.length === 0) {
    throw new Error(
      skipped
        ? "Could not read the selected image(s). Try a PNG or JPEG."
        : "No images selected.",
    );
  }
  if (skipped > 0) {
    // Soft warning — return what we could encode.
    console.warn(`Skipped ${skipped} image(s) without encodable data`);
  }
  return picked.slice(0, MAX_PROMPT_IMAGES);
}
