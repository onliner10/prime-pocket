import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AgentSummary, PairedHost } from "@prime-pocket/protocol";
import { listFleetAgents } from "../../src/api";
import { loadPairedHosts } from "../../src/storage";
import { filterAgents, statusAccent, statusLabel, type InboxFilter } from "../../src/inbox";
import { colors, radii, shadows, space, type } from "../../src/theme";
import { CircleButton } from "../../src/components/CircleButton";
import { Icon, type IconName } from "../../src/components/Icon";
import { PillComposer } from "../../src/components/PillComposer";

const TITLES: Record<InboxFilter, string> = {
  all: "All Agents",
  working: "Working",
  needs_attention: "Needs Attention",
  in_review: "In Review",
};

const EMPTY: Record<InboxFilter, { title: string; body: string; icon: IconName; accent: string }> = {
  all: {
    title: "No Agents Yet",
    body: "Pair a workspace and launch an agent to see it here.",
    icon: "converge",
    accent: colors.allAgents,
  },
  working: {
    title: "Nothing Working",
    body: "Agents currently running appear here.",
    icon: "crosshair",
    accent: colors.working,
  },
  needs_attention: {
    title: "Nothing Needs Attention",
    body: "Agents waiting on your response or review appear here.",
    icon: "bell",
    accent: colors.needsAttention,
  },
  in_review: {
    title: "Nothing In Review",
    body: "Idle agents ready for you to review appear here.",
    icon: "checkCircle",
    accent: colors.inReview,
  },
};

export default function AgentsFilterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const raw = (params.filter ?? "all") as InboxFilter;
  const filter: InboxFilter = raw in TITLES ? raw : "all";
  const title = TITLES[filter];

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

  const filtered = useMemo(() => filterAgents(agents, filter), [agents, filter]);
  const empty = EMPTY[filter];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <CircleButton accessibilityLabel="Back" onPress={() => router.back()}>
          <Icon name="chevronLeft" size={19} color={colors.ink} strokeWidth={2} />
        </CircleButton>
        <View style={styles.topRight}>
          <CircleButton accessibilityLabel="Search">
            <Icon name="search" size={19} color={colors.ink} strokeWidth={1.9} />
          </CircleButton>
          <CircleButton accessibilityLabel="Filter">
            <Icon name="filter" size={19} color={colors.ink} strokeWidth={1.9} />
          </CircleButton>
        </View>
      </View>

      <View style={styles.heading}>
        <Text style={styles.title}>{title}</Text>
        {filtered.length > 0 ? (
          <Text style={styles.subtitle}>
            {filtered.length} {filtered.length === 1 ? "agent" : "agents"}
          </Text>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(a) => `${a.hostId}:${a.id}`}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refresh()}
            tintColor={colors.muted}
          />
        }
        contentContainerStyle={filtered.length === 0 ? styles.emptyWrap : styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: empty.accent + "14" }]}>
              <Icon name={empty.icon} size={26} color={empty.accent} strokeWidth={1.8} />
            </View>
            <Text style={styles.emptyTitle}>{empty.title}</Text>
            <Text style={styles.emptyBody}>{empty.body}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const host = hosts.find((h) => h.hostId === item.hostId)?.label ?? "Workspace";
          const accent = statusAccent(item.status);
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
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
                <View style={styles.badge}>
                  <View style={[styles.dot, { backgroundColor: accent }]} />
                  <Text style={styles.badgeText}>{statusLabel(item.status)}</Text>
                </View>
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

      <View style={styles.composerDock} pointerEvents="box-none">
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
    paddingHorizontal: space.gutter,
    marginTop: 6,
  },
  topRight: { flexDirection: "row", gap: 10 },
  heading: { paddingHorizontal: space.gutter, marginTop: 18, marginBottom: 16 },
  title: type.display,
  subtitle: { ...type.meta, marginTop: 3 },
  list: { paddingHorizontal: space.gutter, paddingBottom: 130, gap: 10 },
  emptyWrap: { flexGrow: 1, justifyContent: "center", paddingBottom: 130 },
  empty: { alignItems: "center", paddingHorizontal: 40 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.circle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { ...type.title, textAlign: "center" },
  emptyBody: { ...type.body, color: colors.muted, textAlign: "center", marginTop: 6 },
  row: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.card,
    paddingHorizontal: 16,
    paddingVertical: 15,
    ...shadows.row,
  },
  pressed: { opacity: 0.7 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowTitle: { ...type.cardLabel, flex: 1, fontSize: 16, letterSpacing: -0.3 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: radii.circle },
  badgeText: { ...type.meta, fontSize: 12 },
  meta: { ...type.meta, fontSize: 12, fontWeight: "400", marginTop: 3 },
  preview: { ...type.bodySmall, color: colors.ink2, marginTop: 8 },
  composerDock: { position: "absolute", left: 16, right: 16, bottom: 18 },
});
