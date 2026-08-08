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
import type { AgentSummary, PairedHost, Workspace } from "@prime-pocket/protocol";
import { listFleetAgents, listFleetWorkspaces, PocketHostClient } from "../src/api";
import {
  loadPairedHosts,
  loadSelectedWorkspaceId,
  saveSelectedWorkspaceId,
} from "../src/storage";
import { countByFilter } from "../src/inbox";
import { colors, proofSafeArea, radii, shadows, space, type } from "../src/theme";
import { CircleButton } from "../src/components/CircleButton";
import { Icon } from "../src/components/Icon";
import { StatusCard } from "../src/components/StatusCard";
import { WorkspaceRow } from "../src/components/WorkspaceRow";
import { PillComposer } from "../src/components/PillComposer";

type FleetWorkspace = Workspace & { hostId: string };

export default function InboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom + proofSafeArea.bottom;
  const [hosts, setHosts] = useState<PairedHost[]>([]);
  const [workspaces, setWorkspaces] = useState<FleetWorkspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
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
      setWorkspaces([]);
      setSelectedWorkspaceId(null);
      setLoading(false);
      return;
    }
    const [agentResult, workspaceResult] = await Promise.all([
      listFleetAgents(paired),
      listFleetWorkspaces(paired),
    ]);
    setAgents(agentResult.agents);
    setWorkspaces(workspaceResult.workspaces);
    const host = paired[0]!;
    const saved = await loadSelectedWorkspaceId(host.hostId);
    const stillThere = workspaceResult.workspaces.some((w) => w.id === saved);
    setSelectedWorkspaceId(stillThere ? saved : workspaceResult.workspaces[0]?.id ?? null);
    const hostErrors = [...agentResult.errors, ...workspaceResult.errors];
    setConnectionError(
      hostErrors.length
        ? `${hostErrors.length} host${hostErrors.length === 1 ? "" : "s"} unavailable`
        : null,
    );
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const counts = countByFilter(agents);

  function goAddRepository() {
    if (hosts.length === 0) {
      router.push("/pair");
      return;
    }
    router.push("/repos/add");
  }

  async function selectWorkspace(ws: FleetWorkspace) {
    setSelectedWorkspaceId(ws.id);
    await saveSelectedWorkspaceId(ws.hostId, ws.id);
  }

  async function submitComposer() {
    const prompt = draft.trim();
    if (!prompt) return;
    if (hosts.length === 0) {
      router.push("/pair");
      return;
    }
    if (workspaces.length === 0) {
      router.push("/repos/add");
      return;
    }
    if (launching) return;
    setLaunching(true);
    try {
      const host = hosts[0]!;
      const workspace =
        workspaces.find((w) => w.id === selectedWorkspaceId) ?? workspaces[0]!;
      const client = new PocketHostClient(host);
      const short = prompt.length > 28 ? `${prompt.slice(0, 28).trim()}…` : prompt;
      const agent = await client.launch({
        name: short,
        prompt,
        workspaceId: workspace.id,
        cwd: workspace.cwd,
      });
      await saveSelectedWorkspaceId(host.hostId, workspace.id);
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

  const emptyBody =
    hosts.length === 0
      ? "Pair a desktop bridge, then add a repository."
      : "Add a GitHub repository or local folder on the host.";

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
            accessibilityLabel="Hosts"
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
            <CircleButton accessibilityLabel="Add repository" onPress={goAddRepository}>
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
            accessibilityLabel="Open hosts to reconnect"
            style={({ pressed }) => [styles.connectionNotice, pressed && styles.pressed]}
            onPress={() => router.push("/hosts")}
          >
            <View style={styles.connectionDot} />
            <Text style={styles.connectionText}>{connectionError}. Tap to reconnect.</Text>
            <Icon name="chevronRight" size={16} color={colors.muted2} strokeWidth={2.1} />
          </Pressable>
        ) : null}

        <Text style={styles.sectionLabel}>Workspaces</Text>

        {loading && workspaces.length === 0 && hosts.length > 0 ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.muted2} />
          </View>
        ) : workspaces.length === 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a repository"
            style={({ pressed }) => [styles.emptyCard, pressed && styles.pressed]}
            onPress={goAddRepository}
          >
            <View style={styles.emptyIcon}>
              <Icon name="folderPlus" size={19} color={colors.muted} strokeWidth={1.75} />
            </View>
            <View style={styles.emptyText}>
              <Text style={styles.emptyTitle}>No repositories yet</Text>
              <Text style={styles.emptyBody}>{emptyBody}</Text>
            </View>
            <Icon name="chevronRight" size={17} color={colors.muted2} strokeWidth={2} />
          </Pressable>
        ) : (
          <View style={styles.workspaces}>
            {workspaces.map((w) => (
              <WorkspaceRow
                key={w.id}
                name={w.fullName ?? w.name}
                subtitle={w.defaultBranch ? `${w.defaultBranch} · ${w.cwd}` : w.cwd}
                variant="plain"
                icon={w.source === "github" ? "github" : "folder"}
                selected={w.id === selectedWorkspaceId}
                onPress={() => void selectWorkspace(w)}
              />
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add another repository"
              style={({ pressed }) => [styles.addMore, pressed && styles.pressed]}
              onPress={goAddRepository}
            >
              <Icon name="plus" size={16} color={colors.ink2} strokeWidth={2} />
              <Text style={styles.addMoreText}>Add repository</Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.dockSpacer, { height: 96 + bottomInset }]} />
      </ScrollView>

      <View
        style={[styles.composerDock, { bottom: Math.max(14, bottomInset + 10) }]}
        pointerEvents="box-none"
      >
        <PillComposer
          value={draft}
          onChangeText={setDraft}
          onPlus={goAddRepository}
          onSubmit={() => void submitComposer()}
          sending={launching}
          placeholder="Plan, ask, build..."
        />
      </View>
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
  addMore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
  },
  addMoreText: { ...type.meta, color: colors.ink2, fontSize: 15, fontWeight: "500" },
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
  composerDock: {
    position: "absolute",
    left: 12,
    right: 12,
  },
});
