import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { decodePairingQr, type PairedHost } from "@prime-pocket/protocol";
import { pairWithHost, resolveReachableBaseUrl } from "../src/api";
import { loadOnboardingComplete, upsertPairedHost } from "../src/storage";
import { colors, fonts, proofSafeArea, radii, space, type } from "../src/theme";
import { CircleButton } from "../src/components/CircleButton";
import { Icon } from "../src/components/Icon";

export default function PairScreen() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [deviceLabel, setDeviceLabel] = useState(Platform.OS === "ios" ? "iPhone" : "Phone");
  const [manualUrl, setManualUrl] = useState("http://127.0.0.1:17420");
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
        fingerprint ? { fingerprint } : undefined,
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
      const onboarded = await loadOnboardingComplete();
      router.replace(onboarded ? "/" : "/onboarding");
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
      await pairFromPayload(
        payload.urls?.length ? payload.urls : [payload.url],
        payload.pairCode,
        payload.fingerprint,
        payload.hostName,
      );
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
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <CircleButton accessibilityLabel="Close" onPress={() => router.back()}>
          <Icon name="close" size={16} color={colors.ink} strokeWidth={2.1} />
        </CircleButton>
        <Text style={styles.navTitle}>Pair host</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.lead}>
          Run <Text style={styles.mono}>prime-pocket bridge --demo --http</Text> on your machine, then
          paste the deep link or enter URL + pair code.
        </Text>

        <Text style={styles.label}>Device label</Text>
        <TextInput
          style={styles.input}
          value={deviceLabel}
          onChangeText={setDeviceLabel}
          placeholderTextColor={colors.muted2}
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
          placeholderTextColor={colors.muted2}
          placeholder="prime-pocket://pair?data=..."
        />
        <Pressable style={styles.primary} onPress={() => void onScanOrPaste()} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Pair from paste</Text>
          )}
        </Pressable>

        <Pressable style={styles.secondary} onPress={() => router.push("/scan")}>
          <Text style={styles.secondaryText}>Open camera scanner</Text>
        </Pressable>

        <Text style={[styles.label, { marginTop: 22 }]}>Or manual</Text>
        <TextInput
          style={styles.input}
          value={manualUrl}
          onChangeText={setManualUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.muted2}
          placeholder="http://127.0.0.1:17420"
        />
        <TextInput
          style={styles.input}
          value={manualCode}
          onChangeText={setManualCode}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.muted2}
          placeholder="pair code"
        />
        <Pressable style={styles.secondary} onPress={() => void onManual()} disabled={busy}>
          <Text style={styles.secondaryText}>Pair manually</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingTop: proofSafeArea.top },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.gutter,
    marginTop: 6,
  },
  navTitle: type.navTitle,
  body: { padding: space.gutter },
  lead: { ...type.body, color: colors.muted, marginBottom: 18 },
  mono: {
    color: colors.ink,
    fontFamily: fonts.mono,
    fontSize: 13,
    backgroundColor: colors.codeBg,
  },
  label: { ...type.meta, fontSize: 13, marginBottom: 7, marginTop: 10, fontWeight: "600" },
  input: {
    ...type.input,
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
  },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  primary: {
    backgroundColor: colors.ink,
    paddingVertical: 15,
    borderRadius: radii.pill,
    alignItems: "center",
  },
  primaryText: { ...type.row, fontWeight: "600", color: "#fff" },
  secondary: {
    marginTop: 10,
    backgroundColor: colors.bgElevated,
    paddingVertical: 15,
    borderRadius: radii.pill,
    alignItems: "center",
  },
  secondaryText: { ...type.pill, fontSize: 15 },
  error: { ...type.body, color: colors.danger, marginTop: 14 },
});
