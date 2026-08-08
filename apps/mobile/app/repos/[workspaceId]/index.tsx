import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { PairedHost, Workspace, Worktree } from "@prime-pocket/protocol";
import { PocketHostClient } from "../../../src/api";
import {
  loadPairedHosts,
  saveSelectedWorktreeId,
  saveSelectedWorkspaceId,
} from "../../../src/storage";
import { colors, proofSafeArea, radii, space, type } from "../../../src/theme";
import { CircleButton } from "../../../src/components/CircleButton";
import { Icon } from "../../../src/components/Icon";

export default function WorkspaceDetailScreen() {
  const router = useRouter();
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const [host, setHost] = useState<PairedHost | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hosts = await loadPairedHosts();
      const paired = hosts[0] ?? null;
      setHost(paired);
      if (!paired || !workspaceId) {
        setError("Pair a host first.");
        return;
      }
      const client = new PocketHostClient(paired);
      const detail = await client.getWorkspace(workspaceId);
      setWorkspace(detail.workspace);
      setWorktrees(detail.worktrees);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function selectWorktree(wt: Worktree) {
    if (!host || !workspaceId) return;
    await saveSelectedWorkspaceId(host.hostId, workspaceId);
    await saveSelectedWorktreeId(host.hostId, wt.id);
    router.replace("/");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <CircleButton accessibilityLabel="Back" onPress={() => router.back()}>
          <Icon name="chevronLeft" size={19} color={colors.ink} strokeWidth={2} />
        </CircleButton>
        <Text style={styles.navTitle} numberOfLines={1}>
          {workspace?.fullName ?? workspace?.name ?? "Workspace"}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>
          Worktrees are branch checkouts on the host. Pick one, then send a task from Inbox.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={colors.muted2} style={{ marginVertical: 20 }} /> : null}

        <Text style={styles.sectionLabel}>Worktrees</Text>
        {worktrees.length === 0 && !loading ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No worktrees yet</Text>
            <Text style={styles.emptyBody}>Create a branch worktree to run agents in this repo.</Text>
          </View>
        ) : (
          worktrees.map((wt) => (
            <Pressable
              key={wt.id}
              accessibilityRole="button"
              accessibilityLabel={`Select worktree ${wt.branch}`}
              onPress={() => void selectWorktree(wt)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.icon}>
                <Icon name="gitBranch" size={18} color={colors.ink2} strokeWidth={1.7} />
              </View>
              <View style={styles.textCol}>
                <Text style={styles.rowTitle}>{wt.branch}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {wt.cwd}
                </Text>
              </View>
              <Icon name="chevronRight" size={16} color={colors.muted2} strokeWidth={2.1} />
            </Pressable>
          ))
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create worktree"
          onPress={() =>
            router.push({
              pathname: "/repos/[workspaceId]/worktree",
              params: { workspaceId: workspaceId! },
            })
          }
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Icon name="plus" size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.primaryText}>Create worktree</Text>
        </Pressable>
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
    gap: 10,
  },
  navTitle: { ...type.row, fontSize: 17, fontWeight: "600", flex: 1, textAlign: "center" },
  body: { paddingHorizontal: space.gutter, paddingBottom: 40 },
  lead: { ...type.body, color: colors.ink2, marginBottom: 16 },
  sectionLabel: { ...type.body, color: colors.muted, marginBottom: 8 },
  error: { ...type.meta, color: colors.danger, marginBottom: 10 },
  empty: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.row,
    padding: 16,
    marginBottom: 12,
  },
  emptyTitle: type.row,
  emptyBody: { ...type.meta, marginTop: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1, gap: 2 },
  rowTitle: { ...type.row, fontSize: 16, fontWeight: "500" },
  rowMeta: { ...type.meta, fontSize: 12, color: colors.muted },
  primary: {
    marginTop: 22,
    backgroundColor: colors.ink,
    borderRadius: radii.row,
    paddingVertical: 15,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  primaryText: { ...type.row, color: "#fff", fontWeight: "600", fontSize: 16 },
  pressed: { opacity: 0.75 },
});
