import { useMemo, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { isImageMime, Routes, type MessageImage, type PairedHost } from "@prime-pocket/protocol";
import { colors } from "../theme";

export function resolveImageUri(
  image: MessageImage,
  host: PairedHost | null,
  agentId?: string,
): string | null {
  if (image.dataBase64) {
    return `data:${image.mimeType};base64,${image.dataBase64}`;
  }
  if (image.artifactId && host && agentId) {
    const base = host.baseUrl.replace(/\/$/, "");
    return `${base}${Routes.agentArtifact(agentId, image.artifactId)}?token=${encodeURIComponent(host.token)}`;
  }
  return null;
}

export function MessageImages({
  images,
  host,
  agentId,
}: {
  images?: MessageImage[];
  host: PairedHost | null;
  agentId?: string;
}) {
  if (!images?.length) return null;
  return (
    <View style={styles.row}>
      {images.map((img, idx) => (
        <AuthImage key={`${img.artifactId ?? img.name ?? idx}`} image={img} host={host} agentId={agentId} />
      ))}
    </View>
  );
}

export function ArtifactImage({
  mimeType,
  url,
}: {
  mimeType: string;
  url: string;
}) {
  if (!isImageMime(mimeType)) return null;
  return <RemoteImage uri={url} />;
}

function AuthImage({
  image,
  host,
  agentId,
}: {
  image: MessageImage;
  host: PairedHost | null;
  agentId?: string;
}) {
  const uri = useMemo(() => resolveImageUri(image, host, agentId), [image, host, agentId]);
  if (!uri) return null;
  return <RemoteImage uri={uri} />;
}

function RemoteImage({ uri }: { uri: string }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <View style={styles.frame}>
      {loading ? <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.muted} /> : null}
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="cover"
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  frame: {
    width: 160,
    height: 110,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.codeBg,
  },
  image: { width: "100%", height: "100%" },
});
