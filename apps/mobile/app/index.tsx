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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { AgentSummary, PairedHost } from "@prime-pocket/protocol";
import { listFleetAgents, PocketHostClient } from "../src/api";
import { loadPairedHosts } from "../src/storage";
import { countByFilter } from "../src/inbox";
import { colors, proofSafeArea, radii, shadows, space, type } from "../src/theme";
import { CircleButton } from "../src/components/CircleButton";
import { Icon } from "../src/components/Icon";
import { StatusCard } from "../src/components/StatusCard";
import { WorkspaceRow } from "../src/components/WorkspaceRow";
import { ComposerDock } from "../src/components/ComposerDock";
import { PillComposer } from "../src/components/PillComposer";

export default function InboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom + proofSafeArea.bottom;
  const [hosts, setHosts] = useState<PairedHost[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [launching, setLaunching] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setConnectionError(null);
    const paired = await loadPairedHosts();
    setHosts(paired);
    if (paired.length === 0) {
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

  const counts = countByFilter(agents);

  async function submitComposer() {
    const prompt = draft.trim();
    if (!prompt || hosts.length === 0) {
      router.push("/pair");
      return;
    }
    if (launching) return;
    setLaunching(true);
    try {
      const host = hosts[0]!;
      const client = new PocketHostClient(host);
      const short =
        prompt.length > 28 ? `${prompt.slice(0, 28).trim()}…` : prompt;
      const agent = await client.launch({
        name: short,
        prompt,
      });
      setDraft("");
      router.push({
        pathname: "/agent/[hostId]/[agentId]",
        params: { hostId: agent.hostId || host.hostId, agentId: agent.id },
      });
    } catch (e) {
      console.warn("launch failed", e);
      router.push({
        pathname: "/agents/all",
        params: { seedPrompt: prompt },
      });
      setDraft("");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refresh()}
            tintColor={colors.muted}
          />
        }
      >
        <View style={styles.topBar}>
          <CircleButton
            accessibilityLabel="Profile"
            tone="elevated"
            onPress={() => router.push("/hosts")}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>M</Text>
            </View>
          </CircleButton>
          <View style={styles.topRight}>
            <CircleButton accessibilityLabel="Search" onPress={() => router.push("/agents/all")}>
              <Icon name="search" size={19} color={colors.ink} strokeWidth={1.9} />
            </CircleButton>
            <CircleButton accessibilityLabel="Pair host" onPress={() => router.push("/pair")}>
              <Icon name="folderPlus" size={19} color={colors.ink} strokeWidth={1.75} />
            </CircleButton>
          </View>
        </View>

        <Text style={styles.inboxTitle}>Inbox</Text>

        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <StatusCard
              title="All Agents"
              icon="converge"
              accent={colors.allAgents}
              onPress={() => router.push("/agents/all")}
            />
            <StatusCard
              title="Working"
              count={counts.working}
              icon="crosshair"
              accent={colors.working}
              onPress={() => router.push("/agents/working")}
            />
          </View>
          <View style={styles.gridRow}>
            <StatusCard
              title="Needs Attention"
              count={counts.needs_attention}
              icon="bell"
              accent={colors.needsAttention}
              onPress={() => router.push("/agents/needs_attention")}
            />
            <StatusCard
              title="In Review"
              count={counts.in_review}
              icon="checkCircle"
              accent={colors.inReview}
              onPress={() => router.push("/agents/in_review")}
            />
          </View>
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

        <Text style={styles.sectionLabel}>Workspaces</Text>

        {hosts.length === 0 ? (
          loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.muted2} />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a workspace"
              style={({ pressed }) => [styles.emptyCard, pressed && styles.pressed]}
              onPress={() => router.push("/pair")}
            >
              <View style={styles.emptyIcon}>
                <Icon name="folderPlus" size={19} color={colors.muted} strokeWidth={1.75} />
              </View>
              <View style={styles.emptyText}>
                <Text style={styles.emptyTitle}>No workspaces yet</Text>
                <Text style={styles.emptyBody}>Pair a desktop bridge to add one.</Text>
              </View>
              <Icon name="chevronRight" size={17} color={colors.muted2} strokeWidth={2} />
            </Pressable>
          )
        ) : (
          <View style={styles.workspaces}>
            {hosts.map((h) => (
              <WorkspaceRow
                key={h.hostId}
                name={h.label}
                variant="plain"
                onPress={() => router.push("/hosts")}
              />
            ))}
          </View>
        )}

        <View style={[styles.dockSpacer, { height: 96 + bottomInset }]} />
      </ScrollView>

      <ComposerDock restingBottom={Math.max(14, bottomInset + 10)}>
        <PillComposer
          value={draft}
          onChangeText={setDraft}
          onPlus={() => router.push("/pair")}
          onSubmit={() => void submitComposer()}
          sending={launching}
          placeholder="Plan, ask, build..."
        />
      </ComposerDock>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingTop: proofSafeArea.top },
  scroll: { paddingHorizontal: space.gutter, paddingBottom: 8 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  topRight: { flexDirection: "row", gap: 10 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radii.circle,
    backgroundColor: colors.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: type.cardLabel.fontFamily,
    color: colors.ink2,
    fontWeight: "400",
    fontSize: 16,
    letterSpacing: -0.2,
  },
  inboxTitle: { ...type.display, marginTop: 22, marginBottom: 22 },
  grid: { gap: space.gap, marginBottom: 30, marginHorizontal: -4 },
  gridRow: { flexDirection: "row", gap: space.gap },
  sectionLabel: { ...type.body, color: colors.muted, marginLeft: 1, marginBottom: 7 },
  connectionNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.row,
    backgroundColor: "#FFF4EA",
  },
  connectionDot: { width: 7, height: 7, borderRadius: radii.circle, backgroundColor: colors.needsAttention },
  connectionText: { ...type.meta, color: colors.ink2, flex: 1 },
  workspaces: { gap: 0 },
  pressed: { opacity: 0.7 },
  loadingCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.row,
    paddingVertical: 24,
    alignItems: "center",
    ...shadows.row,
  },
  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.row,
    paddingVertical: 13,
    paddingLeft: 14,
    paddingRight: 16,
    ...shadows.row,
  },
  emptyIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: { flex: 1, gap: 1 },
  emptyTitle: type.row,
  emptyBody: { ...type.meta, fontSize: 12, fontWeight: "400" },
  dockSpacer: { height: 96 },
});
