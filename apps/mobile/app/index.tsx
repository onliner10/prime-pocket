import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AgentSummary, PairedHost } from "@prime-pocket/protocol";
import { listFleetAgents } from "../src/api";
import { loadPairedHosts } from "../src/storage";
import { countByFilter } from "../src/inbox";
import { colors } from "../src/theme";
import { CircleButton, IconGlyph } from "../src/components/CircleButton";
import { StatusCard } from "../src/components/StatusCard";
import { WorkspaceRow } from "../src/components/WorkspaceRow";
import { PillComposer } from "../src/components/PillComposer";

export default function InboxScreen() {
  const router = useRouter();
  const [hosts, setHosts] = useState<PairedHost[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    const paired = await loadPairedHosts();
    setHosts(paired);
    if (paired.length === 0) {
      setAgents([]);
      setLoading(false);
      return;
    }
    const result = await listFleetAgents(paired);
    setAgents(result.agents);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const counts = countByFilter(agents);

  function submitComposer() {
    if (!draft.trim()) {
      router.push("/pair");
      return;
    }
    // Launch against first host if available, else pair
    if (hosts.length === 0) {
      router.push("/pair");
      return;
    }
    router.push({
      pathname: "/agents/all",
      params: { seedPrompt: draft.trim() },
    });
    setDraft("");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.muted} />
        }
      >
        <View style={styles.topBar}>
          <CircleButton accessibilityLabel="Profile" onPress={() => router.push("/hosts")}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>P</Text>
            </View>
          </CircleButton>
          <View style={styles.topRight}>
            <CircleButton accessibilityLabel="Search" onPress={() => router.push("/agents/all")}>
              <IconGlyph label="⌕" size={18} color={colors.ink} />
            </CircleButton>
            <CircleButton accessibilityLabel="Pair host" onPress={() => router.push("/pair")}>
              <IconGlyph label="＋" size={18} color={colors.ink} />
            </CircleButton>
          </View>
        </View>

        <Text style={styles.inboxTitle}>Inbox</Text>

        {loading && agents.length === 0 && hosts.length === 0 ? (
          <ActivityIndicator style={{ marginVertical: 24 }} color={colors.muted} />
        ) : null}

        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <StatusCard
              title="All Agents"
              icon="◎"
              accent={colors.allAgents}
              onPress={() => router.push("/agents/all")}
            />
            <StatusCard
              title="Working"
              count={counts.working}
              icon="✦"
              accent={colors.working}
              onPress={() => router.push("/agents/working")}
            />
          </View>
          <View style={styles.gridRow}>
            <StatusCard
              title="Needs Attention"
              count={counts.needs_attention}
              icon="◔"
              accent={colors.needsAttention}
              onPress={() => router.push("/agents/needs_attention")}
            />
            <StatusCard
              title="In Review"
              count={counts.in_review}
              icon="✓"
              accent={colors.inReview}
              onPress={() => router.push("/agents/in_review")}
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>WORKSPACES</Text>
        {hosts.length === 0 ? (
          <Pressable style={styles.emptyWorkspaces} onPress={() => router.push("/pair")}>
            <Text style={styles.emptyTitle}>No workspaces yet</Text>
            <Text style={styles.emptyBody}>Pair a desktop bridge to add a workspace.</Text>
          </Pressable>
        ) : (
          hosts.map((h) => (
            <WorkspaceRow
              key={h.hostId}
              name={h.label}
              onPress={() => router.push("/hosts")}
            />
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.composerDock}>
        <PillComposer
          value={draft}
          onChangeText={setDraft}
          onPlus={() => router.push("/pair")}
          onSubmit={submitComposer}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 10,
  },
  topRight: { flexDirection: "row", gap: 10 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  inboxTitle: {
    fontSize: 34,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.6,
    marginBottom: 18,
  },
  grid: { gap: 12, marginBottom: 28 },
  gridRow: { flexDirection: "row", gap: 12 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  emptyWorkspaces: { paddingVertical: 18 },
  emptyTitle: { fontSize: 17, fontWeight: "600", color: colors.ink },
  emptyBody: { marginTop: 4, color: colors.muted, fontSize: 14 },
  composerDock: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
  },
});
