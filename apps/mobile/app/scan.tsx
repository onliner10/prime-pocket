import { useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { X } from "@tamagui/lucide-icons-2";
import { Paragraph, YStack } from "tamagui";
import { decodePairingQr, type PairedHost } from "@prime-pocket/protocol";
import { pairWithHost, resolveReachableBaseUrl } from "../src/api";
import { upsertPairedHost } from "../src/storage";
import { IconButton, PrimaryButton, Screen } from "../src/ui";

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onCode(data: string) {
    if (busy || done) return;
    setBusy(true);
    setError(null);
    try {
      const payload = decodePairingQr(data);
      const baseUrl = await resolveReachableBaseUrl(
        payload.urls?.length ? payload.urls : [payload.url],
      );
      const res = await pairWithHost(
        baseUrl,
        { pairCode: payload.pairCode, deviceLabel: Platform.OS },
        { fingerprint: payload.fingerprint },
      );
      const paired: PairedHost = {
        hostId: res.host.id,
        baseUrl,
        urls: res.host.urls.length ? res.host.urls : [baseUrl],
        token: res.token,
        label: res.host.name || payload.hostName,
        fingerprint: res.host.fingerprint,
        pairedAt: new Date().toISOString(),
      };
      await upsertPairedHost(paired);
      setDone(true);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (Platform.OS === "web") {
    return (
      <Screen justify="center" px={28}>
        <YStack position="absolute" t={16} l={16} z={2}>
          <IconButton
            aria-label="Close"
            icon={<X size={16} strokeWidth={2.1} />}
            onPress={() => router.back()}
          />
        </YStack>
        <Paragraph fontSize="$5" color="$color" text="center">
          Camera QR scan is unavailable on web. Use Pair host → paste.
        </Paragraph>
        <PrimaryButton
          pill
          self="center"
          mt={18}
          px={20}
          height={46}
          role="button"
          aria-label="Open pair"
          onPress={() => router.replace("/pair")}
        >
          Open pair
        </PrimaryButton>
      </Screen>
    );
  }

  if (!permission) {
    return <Screen />;
  }

  if (!permission.granted) {
    return (
      <Screen justify="center" px={28}>
        <Paragraph fontSize="$5" color="$color" text="center">
          Camera permission is required to scan the bridge QR.
        </Paragraph>
        <PrimaryButton
          pill
          self="center"
          mt={18}
          px={20}
          height={46}
          role="button"
          aria-label="Grant camera permission"
          onPress={() => void requestPermission()}
        >
          Grant permission
        </PrimaryButton>
      </Screen>
    );
  }

  return (
    <YStack flex={1} position="relative" bg="$background" justify="center">
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={(result) => {
          void onCode(result.data);
        }}
      />
      <YStack
        position="absolute"
        b={40}
        l={20}
        r={20}
        p={16}
        rounded="$7"
        bg="$shadow8"
        gap={8}
        enterStyle={{ opacity: 0, y: 12 }}
        transition="medium"
      >
        <Paragraph fontSize="$5" color="#fff" text="center">
          Point at the bridge QR
        </Paragraph>
        {error ? (
          <Paragraph fontSize="$5" color="#FF8A80" text="center">
            {error}
          </Paragraph>
        ) : null}
        {busy ? (
          <Paragraph fontSize="$5" color="#fff" text="center">
            Pairing…
          </Paragraph>
        ) : null}
      </YStack>
    </YStack>
  );
}
