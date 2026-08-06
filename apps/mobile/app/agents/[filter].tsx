import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AgentSummary, PairedHost } from "@prime-pocket/protocol";
import { listFleetAgents } from "../../src/api";
import { loadPairedHosts } from "../../src/storage";
import { filterAgents, statusLabel, type InboxFilter } from "../../src/inbox";
import { colors, radii } from "../../src/theme";
import { CircleButton, IconGlyph } from "../../src/components/CircleButton";
import { PillComposer } from "../../src/components/PillComposer";

const TITLES: Record<InboxFilter, string> = {
  all: "All Agents",
  working: "Working",
  needs_attention: "Needs Attention",
  in_review: "In Review",
};

const EMPTY: Record<InboxFilter, { title: string; body: string }> = {
  all: {
    title: "No Agents Yet",
    body: "Pair a workspace and launch an agent to see it here.",
  },
  working: {
    title: "Nothing Working",
    body: "Agents currently running appear here.",
  },
  needs_attention: {
    title: "Nothing Needs Attention",
    body: "Agents waiting on your response or review appear here.",
  },
  in_review: {
    title: "Nothing In Review",
    body: "Idle agents ready for you to review appear here.",
  },
};

export default function AgentsFilterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const filter = (params.filter ?? "all") as InboxFilter;
  const title = TITLES[filter] ?? "Agents";

  const [hosts, setHosts] = useState<PairedHost[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    const paired = await loadPairedHosts();
    setHosts(paired);
    if (!paired.length) {
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

  const filtered = useMemo(() => filterAgents(agents, filter in TITLES ? filter : "all"), [agents, filter]);
  const empty = EMPTY[filter in TITLES ? filter : "all"];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <CircleButton accessibilityLabel="Back" onPress={() => router.back()}>
          <IconGlyph label="‹" size={24} />
        </CircleButton>
        <View style={styles.topRight}>
          <CircleButton accessibilityLabel="Search">
            <IconGlyph label="⌕" size={18} />
          </CircleButton>
          <CircleButton accessibilityLabel="Filter">
            <IconGlyph label="☰" size={16} />
          </CircleButton>
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>

      <FlatList
        data={filtered}
        keyExtractor={(a) => `${a.hostId}:${a.id}`}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.muted} />
        }
        contentContainerStyle={filtered.length === 0 ? styles.emptyWrap : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{empty.title}</Text>
            <Text style={styles.emptyBody}>{empty.body}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const host = hosts.find((h) => h.hostId === item.hostId)?.label ?? "Workspace";
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
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.badge}>{statusLabel(item.status)}</Text>
              </View>
              <Text style={styles.meta}>{host}</Text>
              {item.preview ? (
                <Text style={styles.preview} numberOfLines={2}>
                  {item.preview}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
      />

      <View style={styles.composerDock}>
        <PillComposer
          value={draft}
          onChangeText={setDraft}
          onPlus={() => router.push("/pair")}
          onSubmit={() => {
            if (draft.trim()) setDraft("");
          }}
          placeholder="Plan, ask, build..."
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 4,
  },
  topRight: { flexDirection: "row", gap: 10 },
  title: {
    fontSize: 34,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.6,
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 8,
  },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  emptyWrap: { flexGrow: 1, justifyContent: "center", paddingBottom: 120 },
  empty: { alignItems: "center", paddingHorizontal: 32 },
  emptyTitle: { fontSize: 20, fontWeight: "600", color: colors.ink, textAlign: "center" },
  emptyBody: {
    marginTop: 8,
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 21,
  },
  row: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.card,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  rowTitle: { flex: 1, fontSize: 17, fontWeight: "600", color: colors.ink },
  badge: { fontSize: 13, color: colors.muted, fontWeight: "500" },
  meta: { marginTop: 4, color: colors.muted, fontSize: 13 },
  preview: { marginTop: 8, color: colors.ink, fontSize: 14, lineHeight: 20 },
  composerDock: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
  },
});
