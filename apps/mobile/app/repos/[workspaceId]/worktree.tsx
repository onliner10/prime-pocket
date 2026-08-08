import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { GitHubBranch, PairedHost, Workspace } from "@prime-pocket/protocol";
import { PocketHostClient } from "../../../src/api";
import {
  loadPairedHosts,
  saveSelectedWorktreeId,
  saveSelectedWorkspaceId,
} from "../../../src/storage";
import { colors, proofSafeArea, radii, space, type } from "../../../src/theme";
import { CircleButton } from "../../../src/components/CircleButton";
import { Icon } from "../../../src/components/Icon";

export default function CreateWorktreeScreen() {
  const router = useRouter();
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const [host, setHost] = useState<PairedHost | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [branch, setBranch] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const hosts = await loadPairedHosts();
          const paired = hosts[0] ?? null;
          setHost(paired);
          if (!paired || !workspaceId) return;
          const client = new PocketHostClient(paired);
          const detail = await client.getWorkspace(workspaceId);
          setWorkspace(detail.workspace);
          const fullName = detail.workspace.fullName;
          if (fullName) {
            const list = await client.listGitHubBranches(fullName);
            setBranches(list);
            const preferred =
              list.find((b) => b.name === "feat/hello-world") ??
              list.find((b) => b.isDefault) ??
              list[0];
            setBranch(preferred?.name ?? detail.workspace.defaultBranch ?? "main");
          } else {
            const fallback = detail.workspace.defaultBranch ?? "main";
            setBranches([{ name: fallback, isDefault: true }]);
            setBranch(fallback);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setLoading(false);
        }
      })();
    }, [workspaceId]),
  );

  async function create() {
    if (!host || !workspaceId || !branch?.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const client = new PocketHostClient(host);
      const worktree = await client.createWorktree(workspaceId, {
        branch: branch.trim(),
        name: branch.trim(),
      });
      await saveSelectedWorkspaceId(host.hostId, workspaceId);
      await saveSelectedWorktreeId(host.hostId, worktree.id);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <CircleButton accessibilityLabel="Back" onPress={() => router.back()}>
          <Icon name="chevronLeft" size={19} color={colors.ink} strokeWidth={2} />
        </CircleButton>
        <Text style={styles.navTitle}>New worktree</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.lead}>
          Create a branch worktree on the host. The agent will run inside this checkout.
        </Text>

        <Text style={styles.label}>Repository</Text>
        <View style={styles.repoCard}>
          <Icon name="github" size={18} color={colors.ink2} strokeWidth={1.7} />
          <Text style={styles.repoName} numberOfLines={1}>
            {workspace?.fullName ?? workspace?.name ?? "…"}
          </Text>
        </View>

        <Text style={styles.label}>Branch</Text>
        {loading ? (
          <ActivityIndicator color={colors.muted2} style={{ marginVertical: 12 }} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Branch dropdown"
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [styles.dropdown, pressed && styles.pressed]}
          >
            <Icon name="gitBranch" size={17} color={colors.ink2} strokeWidth={1.7} />
            <Text style={styles.dropdownValue} numberOfLines={1}>
              {branch ?? "Select branch"}
            </Text>
            <Icon name="chevronDown" size={16} color={colors.muted} strokeWidth={2} />
          </Pressable>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create worktree"
          disabled={!branch?.trim() || busy || loading}
          onPress={() => void create()}
          style={({ pressed }) => [
            styles.primary,
            (!branch?.trim() || busy || loading) && styles.primaryDisabled,
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Create worktree</Text>
          )}
        </Pressable>
      </View>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select branch</Text>
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {branches.map((b) => {
                const selected = b.name === branch;
                return (
                  <Pressable
                    key={b.name}
                    accessibilityRole="button"
                    accessibilityLabel={`Branch ${b.name}`}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setBranch(b.name);
                      setPickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.branchRow,
                      selected && styles.branchRowSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Icon name="gitBranch" size={16} color={colors.ink2} strokeWidth={1.7} />
                    <Text style={styles.branchName}>{b.name}</Text>
                    {b.isDefault ? <Text style={styles.defaultPill}>default</Text> : null}
                    {selected ? (
                      <Icon name="checkCircle" size={16} color={colors.addGreen} strokeWidth={1.8} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
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
  },
  navTitle: { ...type.row, fontSize: 17, fontWeight: "600" },
  body: { paddingHorizontal: space.gutter, paddingTop: 8, gap: 8 },
  lead: { ...type.body, color: colors.ink2, marginBottom: 12 },
  label: { ...type.meta, color: colors.muted, marginTop: 8 },
  repoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.row,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  repoName: { ...type.row, fontSize: 16, flex: 1 },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.row,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  dropdownValue: { ...type.row, fontSize: 16, flex: 1, fontWeight: "500" },
  error: { ...type.meta, color: colors.danger, marginTop: 6 },
  primary: {
    marginTop: 18,
    backgroundColor: colors.ink,
    borderRadius: radii.row,
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryDisabled: { opacity: 0.35 },
  primaryText: { ...type.row, color: "#fff", fontWeight: "600", fontSize: 16 },
  pressed: { opacity: 0.75 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
    padding: 12,
  },
  modalSheet: {
    backgroundColor: colors.bgElevated,
    borderRadius: 18,
    padding: 16,
    maxHeight: "70%",
  },
  modalTitle: { ...type.row, fontSize: 17, fontWeight: "600", marginBottom: 10 },
  branchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  branchRowSelected: { backgroundColor: "#F0F4F8", marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 10 },
  branchName: { ...type.row, fontSize: 16, flex: 1 },
  defaultPill: {
    ...type.meta,
    fontSize: 11,
    color: colors.muted,
    backgroundColor: colors.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
});
