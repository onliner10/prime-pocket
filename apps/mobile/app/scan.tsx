import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { decodePairingQr, type PairedHost } from "@prime-pocket/protocol";
import { pairWithHost, resolveReachableBaseUrl } from "../src/api";
import { upsertPairedHost } from "../src/storage";
import { colors, radii } from "../src/theme";
import { CircleButton, IconGlyph } from "../src/components/CircleButton";

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (Platform.OS === "web") {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.topBar}>
          <CircleButton onPress={() => router.back()}>
            <IconGlyph label="✕" size={14} />
          </CircleButton>
        </View>
        <Text style={styles.text}>Camera QR scan is unavailable on web. Use Pair host → paste.</Text>
        <Pressable style={styles.btn} onPress={() => router.replace("/pair")}>
          <Text style={styles.btnText}>Open pair</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return <View style={styles.root} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root}>
        <Text style={styles.text}>Camera permission is required to scan the bridge QR.</Text>
        <Pressable style={styles.btn} onPress={() => void requestPermission()}>
          <Text style={styles.btnText}>Grant permission</Text>
        </Pressable>
      </SafeAreaView>
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
        <Text style={styles.textLight}>Point at the bridge QR</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? <Text style={styles.textLight}>Pairing…</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, justifyContent: "center" },
  topBar: { position: "absolute", top: 16, left: 16, zIndex: 2 },
  overlay: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 16,
  },
  text: { color: colors.ink, textAlign: "center", paddingHorizontal: 24 },
  textLight: { color: "#fff", textAlign: "center" },
  error: { color: "#FF8A80", textAlign: "center", marginTop: 8 },
  btn: {
    marginTop: 16,
    alignSelf: "center",
    backgroundColor: colors.ink,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radii.pill,
  },
  btnText: { color: "#fff", fontWeight: "700" },
});
