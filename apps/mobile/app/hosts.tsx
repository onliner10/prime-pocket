import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { PairedHost } from "@prime-pocket/protocol";
import { loadPairedHosts, removePairedHost, upsertPairedHost } from "../src/storage";
import { reconnectPairedHost } from "../src/api";
import { colors, fonts, proofSafeArea, radii, shadows, space, type } from "../src/theme";
import { CircleButton } from "../src/components/CircleButton";
import { Icon } from "../src/components/Icon";
import { WorkspaceRow } from "../src/components/WorkspaceRow";

export default function HostsScreen() {
  const router = useRouter();
  const [hosts, setHosts] = useState<PairedHost[]>([]);

  useFocusEffect(
    useCallback(() => {
      void loadPairedHosts().then(setHosts);
    }, []),
  );

  async function reconnect(host: PairedHost) {
    try {
      const next = await reconnectPairedHost(host);
      await upsertPairedHost(next);
      setHosts(await loadPairedHosts());
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <CircleButton accessibilityLabel="Back" onPress={() => router.back()}>
          <Icon name="chevronLeft" size={19} color={colors.ink} strokeWidth={2} />
        </CircleButton>
        <Text style={styles.title}>Hosts</Text>
        <CircleButton accessibilityLabel="Pair host" onPress={() => router.push("/pair")}>
          <Icon name="plus" size={19} color={colors.ink} strokeWidth={1.75} />
        </CircleButton>
      </View>
      <Text style={styles.help}>
        Paired bridges are stored on-device. Each host can expose many GitHub/local repositories as
        workspaces. Remote access uses Tailscale or LAN — Pocket does not run a relay.
      </Text>
      <FlatList
        data={hosts}
        keyExtractor={(h) => h.hostId}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={styles.empty}>No paired hosts.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <WorkspaceRow name={item.label} variant="plain" />
            <Text style={styles.meta}>{item.baseUrl}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              fp {item.fingerprint.slice(0, 16)}…
            </Text>
            <View style={styles.row}>
              <Pressable style={styles.btn} onPress={() => void reconnect(item)}>
                <Text style={styles.btnText}>Reconnect</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.danger]}
                onPress={() => void removePairedHost(item.hostId).then(setHosts)}
              >
                <Text style={styles.btnText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
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
  title: type.navTitle,
  help: { ...type.body, color: colors.muted, paddingHorizontal: space.gutter, paddingTop: 14 },
  list: { paddingHorizontal: space.gutter, paddingBottom: 40 },
  empty: { ...type.body, color: colors.muted, textAlign: "center", marginTop: 40 },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.card,
    padding: 14,
    marginTop: 12,
    ...shadows.row,
  },
  meta: {
    fontFamily: fonts.mono,
    color: colors.muted,
    marginTop: 3,
    fontSize: 11,
    paddingHorizontal: 4,
  },
  row: { flexDirection: "row", gap: 8, marginTop: 14 },
  btn: {
    backgroundColor: colors.chip,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: radii.pill,
  },
  danger: { backgroundColor: "#FFEBEA" },
  btnText: type.pill,
});
