import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { decodePairingQr, type PairedHost } from "@prime-pocket/protocol";
import { pairWithHost, resolveReachableBaseUrl } from "../src/api";
import { upsertPairedHost } from "../src/storage";
import { colors } from "../src/theme";

/**
 * Optional camera-based QR pairing. Falls back gracefully on web.
 */
export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (Platform.OS === "web") {
    return (
      <View style={styles.root}>
        <Text style={styles.text}>Camera QR scan is unavailable on web. Use Pair host → paste.</Text>
        <Pressable style={styles.btn} onPress={() => router.back()}>
          <Text style={styles.btnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!permission) {
    return <View style={styles.root} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.root}>
        <Text style={styles.text}>Camera permission is required to scan the bridge QR.</Text>
        <Pressable style={styles.btn} onPress={() => void requestPermission()}>
          <Text style={styles.btnText}>Grant permission</Text>
        </Pressable>
      </View>
    );
  }

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

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={(result) => {
          void onCode(result.data);
        }}
      />
      <View style={styles.overlay}>
        <Text style={styles.text}>Point at the bridge QR</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? <Text style={styles.text}>Pairing…</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, justifyContent: "center" },
  overlay: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    padding: 16,
    backgroundColor: "rgba(11,31,23,0.85)",
    borderRadius: 12,
  },
  text: { color: colors.ink, textAlign: "center" },
  error: { color: colors.danger, textAlign: "center", marginTop: 8 },
  btn: {
    marginTop: 16,
    alignSelf: "center",
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnText: { color: "#042015", fontWeight: "700" },
});
