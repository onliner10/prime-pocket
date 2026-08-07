import { useMemo, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { isImageMime, Routes, type MessageImage, type PairedHost } from "@prime-pocket/protocol";
import { colors, type } from "../theme";

export function resolveImageUri(
  image: MessageImage,
  host: PairedHost | null,
  agentId?: string,
): string | null {
  // Prefer artifact download when available (avoids huge inline payloads / stale base64).
  if (image.artifactId && host && agentId) {
    const base = host.baseUrl.replace(/\/$/, "");
    return `${base}${Routes.agentArtifact(agentId, image.artifactId)}?token=${encodeURIComponent(host.token)}`;
  }
  if (image.dataBase64) {
    return `data:${image.mimeType};base64,${image.dataBase64}`;
  }
  return null;
}

export function MessageImages({
  images,
  host,
  agentId,
  compact = false,
  wide = false,
}: {
  images?: MessageImage[];
  host: PairedHost | null;
  agentId?: string;
  compact?: boolean;
  wide?: boolean;
}) {
  if (!images?.length) return null;
  return (
    <View style={styles.row}>
      {images.map((img, idx) => (
        <AuthImage
          key={`${img.artifactId ?? "inline"}-${img.name ?? "img"}-${idx}`}
          image={img}
          host={host}
          agentId={agentId}
          compact={compact}
          wide={wide}
        />
      ))}
    </View>
  );
}

export function ArtifactImage({
  mimeType,
  url,
  compact = false,
}: {
  mimeType: string;
  url: string;
  /** Thumbnail sizing for previews nested inside a card row. */
  compact?: boolean;
}) {
  if (!isImageMime(mimeType)) return null;
  return <RemoteImage uri={url} compact={compact} />;
}

function AuthImage({
  image,
  host,
  agentId,
  compact = false,
  wide = false,
}: {
  image: MessageImage;
  host: PairedHost | null;
  agentId?: string;
  compact?: boolean;
  wide?: boolean;
}) {
  const uri = useMemo(() => resolveImageUri(image, host, agentId), [image, host, agentId]);
  if (!isImageMime(image.mimeType)) {
    return (
      <View style={[styles.frame, styles.broken]}>
        <Text style={styles.brokenText}>Unsupported</Text>
      </View>
    );
  }
  if (!uri) {
    return (
      <View style={[styles.frame, styles.broken]}>
        <Text style={styles.brokenText}>Missing</Text>
      </View>
    );
  }
  return <RemoteImage uri={uri} compact={compact} wide={wide} />;
}

function RemoteImage({ uri, compact = false, wide = false }: { uri: string; compact?: boolean; wide?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[styles.frame, compact && styles.frameCompact, wide && styles.frameWide, styles.broken]}>
        <Text style={styles.brokenText}>Failed</Text>
      </View>
    );
  }
  return (
    <View style={[styles.frame, compact && styles.frameCompact, wide && styles.frameWide]}>
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
      {wide ? (
        <View style={styles.playButton}>
          <View style={styles.playTriangle} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  frame: {
    width: 160,
    height: 110,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.chip,
  },
  frameCompact: { width: 72, height: 48, borderRadius: 10 },
  frameWide: { width: "100%", height: 123, borderRadius: 6 },
  image: { width: "100%", height: "100%" },
  playButton: {
    position: "absolute",
    top: 10,
    left: "50%",
    marginLeft: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(252,252,252,0.78)",
    alignItems: "center",
    justifyContent: "center",
  },
  playTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 11,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderLeftColor: "#6E6E6E",
    marginLeft: 3,
  },
  broken: { alignItems: "center", justifyContent: "center" },
  brokenText: { ...type.meta, fontSize: 12, fontWeight: "600" },
});
