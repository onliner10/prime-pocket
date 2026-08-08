import { useMemo, useState } from "react";
import { isImageMime, Routes, type MessageImage, type PairedHost } from "@prime-pocket/protocol";
import { Play } from "@tamagui/lucide-icons-2";
import { Image, SizableText, Spinner, styled, XStack, YStack } from "tamagui";

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

const Frame = styled(YStack, {
  name: "ImageFrame",
  // Explicit so the spinner and play badge anchor to the frame, not the page.
  position: "relative",
  width: 160,
  height: 110,
  rounded: 14,
  overflow: "hidden",
  bg: "$color3",

  variants: {
    compact: {
      true: { width: 72, height: 48, rounded: 10 },
    },
    wide: {
      true: { width: "100%", height: 123, rounded: 6 },
    },
    broken: {
      true: { items: "center", justify: "center" },
    },
  } as const,
});

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
    <XStack flexWrap="wrap" gap={8} mt={8}>
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
    </XStack>
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

function Broken({ label, compact, wide }: { label: string; compact?: boolean; wide?: boolean }) {
  return (
    <Frame broken compact={compact} wide={wide}>
      <SizableText fontSize="$2" fontWeight="600" color="$color9">
        {label}
      </SizableText>
    </Frame>
  );
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
  if (!isImageMime(image.mimeType)) return <Broken label="Unsupported" />;
  if (!uri) return <Broken label="Missing" />;
  return <RemoteImage uri={uri} compact={compact} wide={wide} />;
}

function RemoteImage({
  uri,
  compact = false,
  wide = false,
}: {
  uri: string;
  compact?: boolean;
  wide?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  if (failed) return <Broken label="Failed" compact={compact} wide={wide} />;

  return (
    <Frame compact={compact} wide={wide}>
      {loading ? (
        <YStack position="absolute" t={0} l={0} r={0} b={0} items="center" justify="center">
          <Spinner color="$color9" />
        </YStack>
      ) : null}
      <Image
        src={uri}
        width="100%"
        height="100%"
        objectFit="cover"
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
      />
      {wide ? (
        <YStack
          position="absolute"
          t={10}
          l="50%"
          ml={-18}
          width={36}
          height={36}
          rounded={999}
          bg="$background08"
          items="center"
          justify="center"
        >
          <Play size={16} color="$color9" fill="currentColor" strokeWidth={1.5} />
        </YStack>
      ) : null}
    </Frame>
  );
}
