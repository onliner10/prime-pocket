import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import type { AgentSummary, PairedHost } from "@prime-pocket/protocol";
import { listFleetAgents } from "../src/api";
import { loadPairedHosts } from "../src/storage";
import { colors } from "../src/theme";

export default function FleetScreen() {
  const router = useRouter();
  const [hosts, setHosts] = useState<PairedHost[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [errors, setErrors] = useState<Array<{ hostId: string; error: string }>>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const paired = await loadPairedHosts();
    setHosts(paired);
    if (paired.length === 0) {
      setAgents([]);
      setErrors([]);
      setLoading(false);
      return;
    }
    const result = await listFleetAgents(paired);
    setAgents(result.agents);
    setErrors(result.errors);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Text style={styles.brand}>Prime Pocket</Text>
        <Text style={styles.sub}>
          {hosts.length === 0
            ? "Pair a desktop bridge to control local Prime Agent sessions."
            : `${hosts.length} host${hosts.length === 1 ? "" : "s"} · ${agents.length} agents`}
        </Text>
      </View>

      <View style={styles.actions}>
        <Link href="/pair" asChild>
          <Pressable style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Pair host</Text>
          </Pressable>
        </Link>
        <Link href="/scan" asChild>
          <Pressable style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Scan QR</Text>
          </Pressable>
        </Link>
        <Link href="/hosts" asChild>
          <Pressable style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Hosts</Text>
          </Pressable>
        </Link>
      </View>

      {errors.length > 0 && (
        <View style={styles.errorBox}>
          {errors.map((e) => (
            <Text key={e.hostId} style={styles.errorText}>
              {hosts.find((h) => h.hostId === e.hostId)?.label ?? e.hostId}: {e.error}
            </Text>
          ))}
        </View>
      )}

      {loading && agents.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={agents}
          keyExtractor={(a) => `${a.hostId}:${a.id}`}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.accent} />}
          contentContainerStyle={agents.length === 0 ? styles.emptyWrap : styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {hosts.length === 0 ? "No paired hosts yet." : "No agents on reachable hosts."}
            </Text>
          }
          renderItem={({ item }) => {
            const hostLabel = hosts.find((h) => h.hostId === item.hostId)?.label ?? item.hostId;
            return (
              <Pressable
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: "/agent/[hostId]/[agentId]",
                    params: { hostId: item.hostId, agentId: item.id },
                  })
                }
              >
                <View style={styles.rowTop}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={[styles.badge, statusColor(item.status)]}>{item.status}</Text>
                </View>
                <Text style={styles.rowMeta}>{hostLabel}</Text>
                {item.preview ? (
                  <Text style={styles.preview} numberOfLines={2}>
                    {item.preview}
                  </Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function statusColor(status: string) {
  if (status === "running") return { color: colors.accent };
  if (status === "needs_input") return { color: "#F0C14A" };
  if (status === "error") return { color: colors.danger };
  return { color: colors.muted };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  brand: {
    fontSize: 34,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.5,
  },
  sub: { marginTop: 6, color: colors.muted, fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginBottom: 12 },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryBtnText: { color: "#042015", fontWeight: "700" },
  secondaryBtn: {
    borderColor: colors.line,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  secondaryBtnText: { color: colors.ink, fontWeight: "600" },
  errorBox: {
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 10,
    backgroundColor: "#2A1816",
    borderRadius: 8,
  },
  errorText: { color: colors.danger, fontSize: 12 },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  emptyWrap: { flexGrow: 1, justifyContent: "center", padding: 40 },
  empty: { color: colors.muted, textAlign: "center" },
  row: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowTitle: { color: colors.ink, fontSize: 17, fontWeight: "600" },
  badge: { fontSize: 12, fontWeight: "600", textTransform: "uppercase" },
  rowMeta: { color: colors.muted, marginTop: 4, fontSize: 12 },
  preview: { color: colors.ink, marginTop: 8, opacity: 0.85, fontSize: 14 },
});
