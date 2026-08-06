import * as ImagePicker from "expo-image-picker";
import type { PendingImage } from "./components/PillComposer";

export async function pickImages(): Promise<PendingImage[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Photo library permission is required to share images.");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    quality: 0.85,
    base64: true,
  });
  if (result.canceled) return [];
  return result.assets
    .filter((a) => a.base64)
    .map((a, i) => ({
      id: `img_${Date.now()}_${i}`,
      uri: a.uri,
      mimeType: a.mimeType ?? "image/jpeg",
      dataBase64: a.base64!,
      name: a.fileName ?? `photo-${i + 1}.jpg`,
    }));
}
