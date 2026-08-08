import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { AgentSummary, PairedHost } from "@prime-pocket/protocol";
import { listFleetAgents } from "../../src/api";
import { loadPairedHosts } from "../../src/storage";
import { filterAgents, statusAccent, statusLabel, type InboxFilter } from "../../src/inbox";
import { colors, proofSafeArea, radii, shadows, space, type } from "../../src/theme";
import { CircleButton } from "../../src/components/CircleButton";
import { Icon, type IconName } from "../../src/components/Icon";
import { ComposerDock } from "../../src/components/ComposerDock";
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
    body: "Pair a host, add a repository, and launch an agent to see it here.",
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
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom + proofSafeArea.bottom;
  const params = useLocalSearchParams<{ filter?: string }>();
  const raw = (params.filter ?? "all") as InboxFilter;
  const filter: InboxFilter = raw in TITLES ? raw : "all";
  const title = TITLES[filter];

  const [hosts, setHosts] = useState<PairedHost[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setConnectionError(null);
    const paired = await loadPairedHosts();
    setHosts(paired);
    if (!paired.length) {
      setAgents([]);
      setLoading(false);
      return;
    }
    const result = await listFleetAgents(paired);
    setAgents(result.agents);
    setConnectionError(result.errors.length ? `${result.errors.length} workspace${result.errors.length === 1 ? "" : "s"} unavailable` : null);
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

      {connectionError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open workspaces to reconnect"
          style={({ pressed }) => [styles.connectionNotice, pressed && styles.pressed]}
          onPress={() => router.push("/hosts")}
        >
          <View style={styles.connectionDot} />
          <Text style={styles.connectionText}>{connectionError}. Tap to reconnect.</Text>
          <Icon name="chevronRight" size={16} color={colors.muted2} strokeWidth={2.1} />
        </Pressable>
      ) : null}

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
        contentContainerStyle={filtered.length === 0 ? [styles.emptyWrap, { paddingBottom: 115 + bottomInset }] : [styles.list, { paddingBottom: 130 + bottomInset }]}
        ListEmptyComponent={
          <View style={styles.empty}>
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

      <ComposerDock restingBottom={Math.max(14, bottomInset + 10)}>
        <PillComposer
          value={draft}
          onChangeText={setDraft}
          onPlus={() => router.push("/pair")}
          onSubmit={() => {
            if (draft.trim()) setDraft("");
          }}
          placeholder="Plan, ask, build..."
        />
      </ComposerDock>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingTop: proofSafeArea.top },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: space.gutter,
    marginTop: 6,
  },
  topRight: { flexDirection: "row", gap: 10 },
  heading: { paddingHorizontal: space.gutter, marginTop: 22, marginBottom: 16 },
  title: type.display,
  subtitle: { ...type.meta, marginTop: 3 },
  connectionNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginHorizontal: space.gutter,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.row,
    backgroundColor: "#FFF4EA",
  },
  connectionDot: { width: 7, height: 7, borderRadius: radii.circle, backgroundColor: colors.needsAttention },
  connectionText: { ...type.meta, color: colors.ink2, flex: 1 },
  list: { paddingHorizontal: space.gutter, gap: 10 },
  emptyWrap: { flexGrow: 1, justifyContent: "center" },
  empty: { alignItems: "center", paddingHorizontal: 30 },
  emptyTitle: { ...type.body, color: colors.muted, fontSize: 19, lineHeight: 25, textAlign: "center" },
  emptyBody: { ...type.body, color: colors.muted, fontSize: 17, lineHeight: 24, textAlign: "center", marginTop: 5 },
  row: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
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
});
