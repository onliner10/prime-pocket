import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { GitHubStatus, PairedHost } from "@prime-pocket/protocol";
import { PocketHostClient } from "../src/api";
import { loadPairedHosts } from "../src/storage";
import { colors, proofSafeArea, radii, space, type } from "../src/theme";
import { CircleButton } from "../src/components/CircleButton";
import { Icon } from "../src/components/Icon";

/**
 * Pair / connect GitHub on the paired host.
 * Demo bridges expose mock connect (no credentials). Live hosts will use OAuth/token later.
 */
export default function GitHubConnectScreen() {
  const router = useRouter();
  const [host, setHost] = useState<PairedHost | null>(null);
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const paired = await loadPairedHosts();
    const first = paired[0] ?? null;
    setHost(first);
    if (!first) {
      setStatus(null);
      return;
    }
    try {
      const client = new PocketHostClient(first);
      setStatus(await client.githubStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function connectMock() {
    if (!host || busy) return;
    setBusy(true);
    setError(null);
    try {
      const client = new PocketHostClient(host);
      setStatus(await client.connectGitHub({ mode: "mock" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!host || busy) return;
    setBusy(true);
    setError(null);
    try {
      const client = new PocketHostClient(host);
      setStatus(await client.disconnectGitHub());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <CircleButton accessibilityLabel="Close" onPress={() => router.back()}>
          <Icon name="close" size={16} color={colors.ink} strokeWidth={2.1} />
        </CircleButton>
        <Text style={styles.navTitle}>Connect GitHub</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.lead}>
          GitHub lives on your paired host. Pocket never stores a GitHub token in the cloud — the
          bridge holds the connection.
        </Text>

        {!host ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pair a host first</Text>
            <Text style={styles.cardBody}>GitHub connects through the desktop bridge.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pair host"
              onPress={() => router.push("/pair")}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              <Text style={styles.primaryText}>Pair host</Text>
            </Pressable>
          </View>
        ) : status?.connected ? (
          <View style={styles.card}>
            <View style={styles.row}>
              <Icon name="github" size={22} color={colors.ink} strokeWidth={1.7} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  Connected{status.mock ? " · mock" : ""}
                </Text>
                <Text style={styles.cardBody}>Signed in as {status.login ?? "GitHub"}</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Disconnect GitHub"
              disabled={busy}
              onPress={() => void disconnect()}
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            >
              {busy ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <Text style={styles.secondaryText}>Disconnect</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={() => router.back()}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              <Text style={styles.primaryText}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.row}>
              <Icon name="github" size={22} color={colors.ink} strokeWidth={1.7} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Not connected</Text>
                <Text style={styles.cardBody}>
                  {status?.mockAvailable
                    ? "This host supports mock GitHub for demos — no credentials needed."
                    : "Authorize GitHub on the host to list repositories and branches."}
                </Text>
              </View>
            </View>

            {status?.mockAvailable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Use mock GitHub"
                disabled={busy}
                onPress={() => void connectMock()}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>Use mock GitHub</Text>
                )}
              </Pressable>
            ) : (
              <View style={styles.disabledBox}>
                <Text style={styles.cardBody}>
                  Live OAuth/token pairing is not wired in this build. Start the bridge with
                  `--demo` to use mock GitHub.
                </Text>
              </View>
            )}
          </View>
        )}

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
    marginBottom: 8,
  },
  navTitle: { ...type.row, fontSize: 17, fontWeight: "600" },
  body: { paddingHorizontal: space.gutter, paddingTop: 8 },
  lead: { ...type.body, color: colors.ink2, marginBottom: 18 },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.row,
    padding: 16,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  cardTitle: { ...type.row, fontSize: 17, fontWeight: "600" },
  cardBody: { ...type.meta, color: colors.muted, marginTop: 3, fontSize: 13, lineHeight: 18 },
  primary: {
    backgroundColor: colors.ink,
    borderRadius: radii.row,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { ...type.row, color: "#fff", fontWeight: "600", fontSize: 16 },
  secondary: {
    backgroundColor: colors.chip,
    borderRadius: radii.row,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryText: { ...type.row, color: colors.ink, fontWeight: "600", fontSize: 16 },
  disabledBox: {
    backgroundColor: colors.chip,
    borderRadius: radii.row,
    padding: 12,
  },
  error: { ...type.meta, color: colors.danger, marginTop: 14 },
  pressed: { opacity: 0.75 },
});
