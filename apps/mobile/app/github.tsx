import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { GitHubStatus, PairedHost } from "@prime-pocket/protocol";
import { PocketHostClient } from "../src/api";
import { loadPairedHosts } from "../src/storage";
import { colors, fonts, proofSafeArea, radii, space, type } from "../src/theme";
import { CircleButton } from "../src/components/CircleButton";
import { Icon } from "../src/components/Icon";

const TOKEN_SETUP_URL =
  "https://github.com/settings/tokens/new?scopes=repo&description=Prime%20Pocket";

/** Fetch failures the platform reports with no HTTP status behind them. */
const UNREACHABLE = /network request failed|failed to fetch|load failed|timed out|aborted/i;

function describeError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (UNREACHABLE.test(message)) {
    return "Can't reach the bridge. Check that prime-pocket bridge is running on the host and that this phone is on the same LAN or tailnet.";
  }
  return message;
}

/**
 * Connect GitHub on the paired host.
 * Demo bridges connect a mock catalog with no credentials; live bridges take a personal
 * access token that is stored on the host and never held by the app.
 */
export default function GitHubConnectScreen() {
  const router = useRouter();
  const [host, setHost] = useState<PairedHost | null>(null);
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [token, setToken] = useState("");
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setChecking(true);
    try {
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
        setStatus(null);
        setError(describeError(e));
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function retry() {
    if (busy) return;
    setBusy(true);
    try {
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function connectMock() {
    if (!host || busy) return;
    setBusy(true);
    setError(null);
    try {
      const client = new PocketHostClient(host);
      setStatus(await client.connectGitHub({ mode: "mock" }));
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function connectToken() {
    if (!host || busy) return;
    const value = token.trim();
    if (!value) {
      setError("Paste a personal access token first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const client = new PocketHostClient(host);
      const next = await client.connectGitHub({ mode: "token", token: value });
      setStatus(next);
      setToken("");
    } catch (e) {
      setError(describeError(e));
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

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.lead}>
          GitHub lives on your paired host. Pocket never stores a GitHub token in the cloud — the
          bridge holds the connection.
        </Text>

        {checking && !status ? (
          <View style={[styles.card, styles.checkingCard]}>
            <ActivityIndicator color={colors.muted} />
            <Text style={styles.cardBody}>
              {host ? `Checking GitHub on ${host.label}…` : "Looking for a paired host…"}
            </Text>
          </View>
        ) : !host ? (
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
        ) : !status ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Host unreachable</Text>
            <Text style={styles.cardBody}>
              {error ??
                `No answer from ${host.label}. Start the bridge on that machine and try again.`}
            </Text>
            <Text style={styles.hint}>
              Paired at <Text style={styles.mono}>{host.baseUrl}</Text>
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry"
              disabled={busy}
              onPress={() => void retry()}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Retry</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Manage hosts"
              onPress={() => router.push("/hosts")}
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryText}>Manage hosts</Text>
            </Pressable>
          </View>
        ) : status.connected ? (
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
                  {status.mockAvailable
                    ? "This host supports mock GitHub for demos — no credentials needed."
                    : `Paste a personal access token to list repositories and branches. It stays on ${host.label} — the app never keeps a copy.`}
                </Text>
              </View>
            </View>

            {status.mockAvailable ? (
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
              <View style={styles.form}>
                <Text style={styles.label}>Personal access token</Text>
                <TextInput
                  accessibilityLabel="GitHub personal access token"
                  style={styles.input}
                  value={token}
                  onChangeText={setToken}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ghp_…"
                  placeholderTextColor={colors.muted}
                  onSubmitEditing={() => void connectToken()}
                  returnKeyType="go"
                />
                <Text style={styles.hint}>
                  A classic token needs the <Text style={styles.mono}>repo</Text> scope; a
                  fine-grained token needs read access to Contents and Metadata.
                </Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Create a token on github.com"
                  onPress={() => void Linking.openURL(TOKEN_SETUP_URL)}
                  style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
                >
                  <Text style={styles.link}>Create a token on github.com</Text>
                  <Icon name="chevronRight" size={15} color={colors.ink2} strokeWidth={1.9} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Connect GitHub"
                  disabled={busy || !token.trim()}
                  onPress={() => void connectToken()}
                  style={({ pressed }) => [
                    styles.primary,
                    !token.trim() && styles.primaryDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>Connect GitHub</Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* The unreachable card already carries its own copy of the error. */}
        {error && status ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
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
  body: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 32 },
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
  checkingCard: { flexDirection: "row", alignItems: "center", gap: 12 },
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
  primaryDisabled: { opacity: 0.35 },
  form: { gap: 10 },
  label: { ...type.meta, color: colors.ink2, fontWeight: "600" },
  input: {
    ...type.input,
    backgroundColor: colors.bgSunken,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  hint: { ...type.meta, color: colors.muted, fontSize: 13, lineHeight: 19 },
  mono: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink2, backgroundColor: colors.codeBg },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6 },
  link: { ...type.meta, color: colors.ink2, fontWeight: "600", fontSize: 14 },
  error: { ...type.meta, color: colors.danger, marginTop: 14, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.75 },
});
