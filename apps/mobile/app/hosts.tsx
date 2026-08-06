import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import type { PairedHost } from "@prime-pocket/protocol";
import { loadPairedHosts, removePairedHost, upsertPairedHost } from "../src/storage";
import { reconnectPairedHost } from "../src/api";
import { colors } from "../src/theme";

export default function HostsScreen() {
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
    <View style={styles.root}>
      <Text style={styles.help}>
        Hosts are stored on-device. Remote access uses Tailscale or LAN — Pocket does not run a relay.
      </Text>
      <FlatList
        data={hosts}
        keyExtractor={(h) => h.hostId}
        contentContainerStyle={{ padding: 20 }}
        ListEmptyComponent={<Text style={styles.empty}>No paired hosts.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.label}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  help: { color: colors.muted, paddingHorizontal: 20, paddingTop: 12, lineHeight: 20 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 40 },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderColor: colors.line,
    borderWidth: 1,
  },
  title: { color: colors.ink, fontSize: 17, fontWeight: "600" },
  meta: { color: colors.muted, marginTop: 4, fontSize: 12 },
  row: { flexDirection: "row", gap: 8, marginTop: 12 },
  btn: {
    backgroundColor: colors.accentDim,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  danger: { backgroundColor: "#5A2A24" },
  btnText: { color: colors.ink, fontWeight: "600" },
});
