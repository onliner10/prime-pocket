import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { PairedHost, Workspace } from "@prime-pocket/protocol";
import { PocketHostClient } from "../../../src/api";
import {
  loadPairedHosts,
  saveSelectedWorktreeId,
  saveSelectedWorkspaceId,
} from "../../../src/storage";
import { colors, fonts, proofSafeArea, radii, space, type } from "../../../src/theme";
import { CircleButton } from "../../../src/components/CircleButton";
import { Icon } from "../../../src/components/Icon";

export default function CreateWorktreeScreen() {
  const router = useRouter();
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const [host, setHost] = useState<PairedHost | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [branch, setBranch] = useState("feat/hello-world");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const hosts = await loadPairedHosts();
        const paired = hosts[0] ?? null;
        setHost(paired);
        if (!paired || !workspaceId) return;
        try {
          const client = new PocketHostClient(paired);
          const detail = await client.getWorkspace(workspaceId);
          setWorkspace(detail.workspace);
          if (detail.workspace.defaultBranch && branch === "feat/hello-world") {
            // keep demo-friendly default branch name
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })();
    }, [workspaceId, branch]),
  );

  async function create() {
    if (!host || !workspaceId || !branch.trim() || busy) return;
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
        <TextInput
          style={styles.input}
          value={branch}
          onChangeText={setBranch}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="feat/my-change"
          placeholderTextColor={colors.muted2}
          accessibilityLabel="Branch name"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create worktree"
          disabled={!branch.trim() || busy}
          onPress={() => void create()}
          style={({ pressed }) => [
            styles.primary,
            (!branch.trim() || busy) && styles.primaryDisabled,
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
  input: {
    ...type.body,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.row,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.ink,
    fontFamily: fonts.mono,
    fontSize: 15,
  },
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
});
