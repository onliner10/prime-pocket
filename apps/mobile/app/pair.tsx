import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { decodePairingQr, type PairedHost } from "@prime-pocket/protocol";
import { pairWithHost, resolveReachableBaseUrl } from "../src/api";
import { upsertPairedHost } from "../src/storage";
import { colors } from "../src/theme";

export default function PairScreen() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [deviceLabel, setDeviceLabel] = useState(Platform.OS === "ios" ? "iPhone" : "Phone");
  const [manualUrl, setManualUrl] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pairFromPayload(urls: string[], pairCode: string, fingerprint: string, hostName: string) {
    setBusy(true);
    setError(null);
    try {
      const baseUrl = await resolveReachableBaseUrl(urls);
      const res = await pairWithHost(
        baseUrl,
        { pairCode, deviceLabel: deviceLabel || "Phone" },
        { fingerprint },
      );
      const paired: PairedHost = {
        hostId: res.host.id,
        baseUrl,
        urls: res.host.urls.length ? res.host.urls : urls,
        token: res.token,
        label: res.host.name || hostName,
        fingerprint: res.host.fingerprint,
        pairedAt: new Date().toISOString(),
      };
      await upsertPairedHost(paired);
      router.replace("/");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/invalid or expired pair code/i.test(msg) || /pair_invalid/i.test(msg)) {
        setError(
          "Invalid or expired pair code. On the desktop run `prime-pocket pair-code` (or restart the bridge) and paste the new QR/deep link.",
        );
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onScanOrPaste() {
    try {
      const payload = decodePairingQr(raw.trim());
      await pairFromPayload(payload.urls?.length ? payload.urls : [payload.url], payload.pairCode, payload.fingerprint, payload.hostName);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onManual() {
    if (!manualUrl || !manualCode) {
      setError("URL and pair code required");
      return;
    }
    await pairFromPayload([manualUrl], manualCode.trim(), "", "host");
  }

  return (
    <View style={styles.root}>
      <Text style={styles.lead}>
        Run <Text style={styles.mono}>prime-pocket bridge --demo</Text> on your machine, then paste the
        deep link or enter the URL and pair code. For remote access, put phone and desktop on the same
        Tailscale tailnet.
      </Text>

      <Text style={styles.label}>Device label</Text>
      <TextInput
        style={styles.input}
        value={deviceLabel}
        onChangeText={setDeviceLabel}
        placeholderTextColor={colors.muted}
        placeholder="My phone"
      />

      <Text style={styles.label}>Paste QR deep link / JSON</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={raw}
        onChangeText={setRaw}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.muted}
        placeholder="prime-pocket://pair?data=..."
      />
      <Pressable style={styles.primaryBtn} onPress={() => void onScanOrPaste()} disabled={busy}>
        {busy ? <ActivityIndicator color="#042015" /> : <Text style={styles.primaryBtnText}>Pair from paste</Text>}
      </Pressable>

      <Pressable style={[styles.secondaryBtn, { marginTop: 10 }]} onPress={() => router.push("/scan")}>
        <Text style={styles.secondaryBtnText}>Open camera scanner</Text>
      </Pressable>

      <Text style={[styles.label, { marginTop: 24 }]}>Or manual</Text>
      <TextInput
        style={styles.input}
        value={manualUrl}
        onChangeText={setManualUrl}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.muted}
        placeholder="https://100.x.y.z:7420"
      />
      <TextInput
        style={styles.input}
        value={manualCode}
        onChangeText={setManualCode}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.muted}
        placeholder="pair code"
      />
      <Pressable style={styles.secondaryBtn} onPress={() => void onManual()} disabled={busy}>
        <Text style={styles.secondaryBtnText}>Pair manually</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  lead: { color: colors.muted, marginBottom: 16, lineHeight: 20 },
  mono: { color: colors.accent, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
  label: { color: colors.ink, marginBottom: 6, marginTop: 8, fontWeight: "600" },
  input: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    marginBottom: 10,
  },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryBtnText: { color: "#042015", fontWeight: "700" },
  secondaryBtn: {
    borderColor: colors.line,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  secondaryBtnText: { color: colors.ink, fontWeight: "600" },
  error: { color: colors.danger, marginTop: 14 },
});
