import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { GitHubCatalogRepo, GitHubStatus, PairedHost } from "@prime-pocket/protocol";
import { PocketHostClient } from "../../src/api";
import { loadPairedHosts, saveSelectedWorkspaceId } from "../../src/storage";
import { colors, fonts, proofSafeArea, radii, space, type } from "../../src/theme";
import { CircleButton } from "../../src/components/CircleButton";
import { Icon } from "../../src/components/Icon";

export default function AddRepositoryScreen() {
  const router = useRouter();
  const [host, setHost] = useState<PairedHost | null>(null);
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [repos, setRepos] = useState<GitHubCatalogRepo[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localName, setLocalName] = useState("");
  const [localCwd, setLocalCwd] = useState("");

  const refresh = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const hosts = await loadPairedHosts();
      const paired = hosts[0] ?? null;
      setHost(paired);
      if (!paired) {
        setStatus(null);
        setRepos([]);
        setError("Pair a host first, then add repositories.");
        return;
      }
      const client = new PocketHostClient(paired);
      const gh = await client.githubStatus();
      setStatus(gh);
      if (!gh.connected) {
        try {
          const connected = await client.connectGitHub();
          setStatus(connected);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          setRepos([]);
          return;
        }
      }
      const catalog = await client.listGitHubRepos(q);
      setStatus(catalog.status);
      setRepos(catalog.repos);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function addFromGitHub(repo: GitHubCatalogRepo) {
    if (!host || adding) return;
    setAdding(repo.fullName);
    setError(null);
    try {
      const client = new PocketHostClient(host);
      const workspace = await client.addWorkspaceFromGitHub({ fullName: repo.fullName });
      await saveSelectedWorkspaceId(host.hostId, workspace.id);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(null);
    }
  }

  async function addLocal() {
    if (!host || !localName.trim() || !localCwd.trim() || adding) return;
    setAdding("local");
    setError(null);
    try {
      const client = new PocketHostClient(host);
      const workspace = await client.addLocalWorkspace({
        name: localName.trim(),
        cwd: localCwd.trim(),
      });
      await saveSelectedWorkspaceId(host.hostId, workspace.id);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <CircleButton accessibilityLabel="Close" onPress={() => router.back()}>
          <Icon name="close" size={16} color={colors.ink} strokeWidth={2.1} />
        </CircleButton>
        <Text style={styles.navTitle}>Add repository</Text>
        <View style={{ width: 38 }} />
      </View>

      <FlatList
        data={repos}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.lead}>
              Pick a GitHub repo. The paired host opens a worktree and agents run there.
            </Text>

            {status?.mock ? (
              <View style={styles.mockBanner} accessibilityLabel="GitHub mock mode">
                <Icon name="github" size={16} color={colors.ink2} strokeWidth={1.7} />
                <Text style={styles.mockText}>
                  Mock GitHub · signed in as {status.login ?? "demo"} — no credentials needed
                </Text>
              </View>
            ) : status?.connected ? (
              <View style={styles.mockBanner}>
                <Icon name="github" size={16} color={colors.ink2} strokeWidth={1.7} />
                <Text style={styles.mockText}>GitHub · {status.login ?? "connected"}</Text>
              </View>
            ) : null}

            <View style={styles.searchRow}>
              <Icon name="search" size={17} color={colors.muted} strokeWidth={1.9} />
              <TextInput
                style={styles.search}
                placeholder="Search repositories"
                placeholderTextColor={colors.muted2}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => void refresh(query)}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Search"
                onPress={() => void refresh(query)}
                style={({ pressed }) => [styles.searchBtn, pressed && styles.pressed]}
              >
                <Text style={styles.searchBtnText}>Go</Text>
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading ? (
              <ActivityIndicator color={colors.muted2} style={{ marginVertical: 18 }} />
            ) : (
              <Text style={styles.sectionLabel}>From GitHub</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.fullName}`}
            disabled={Boolean(adding)}
            onPress={() => void addFromGitHub(item)}
            style={({ pressed }) => [styles.repoRow, pressed && styles.pressed]}
          >
            <View style={styles.repoIcon}>
              <Icon name="github" size={18} color={colors.ink2} strokeWidth={1.7} />
            </View>
            <View style={styles.repoText}>
              <Text style={styles.repoName} numberOfLines={1}>
                {item.fullName}
              </Text>
              <Text style={styles.repoMeta} numberOfLines={2}>
                {[item.private ? "Private" : "Public", item.language, item.description]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
            {adding === item.fullName ? (
              <ActivityIndicator color={colors.muted} />
            ) : (
              <Icon name="plus" size={18} color={colors.ink} strokeWidth={2} />
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No repositories match.</Text> : null
        }
        ListFooterComponent={
          <View style={styles.localBlock}>
            <Text style={styles.sectionLabel}>Or local folder on host</Text>
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={colors.muted2}
              value={localName}
              onChangeText={setLocalName}
            />
            <TextInput
              style={styles.input}
              placeholder="/Users/you/src/my-repo"
              placeholderTextColor={colors.muted2}
              value={localCwd}
              onChangeText={setLocalCwd}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add local folder"
              disabled={!localName.trim() || !localCwd.trim() || Boolean(adding)}
              onPress={() => void addLocal()}
              style={({ pressed }) => [
                styles.localBtn,
                (!localName.trim() || !localCwd.trim()) && styles.localBtnDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.localBtnText}>
                {adding === "local" ? "Adding…" : "Add local folder"}
              </Text>
            </Pressable>
          </View>
        }
      />
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
  list: { paddingHorizontal: space.gutter, paddingBottom: 40 },
  header: { marginBottom: 4 },
  lead: { ...type.body, color: colors.ink2, marginBottom: 14 },
  mockBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EEF3F8",
    borderRadius: radii.row,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  mockText: { ...type.meta, color: colors.ink2, flex: 1, fontSize: 13 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.row,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingLeft: 12,
    paddingRight: 6,
    marginBottom: 12,
  },
  search: {
    flex: 1,
    ...type.body,
    paddingVertical: 12,
    color: colors.ink,
  },
  searchBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.chip,
  },
  searchBtnText: { ...type.meta, color: colors.ink, fontWeight: "600" },
  sectionLabel: { ...type.body, color: colors.muted, marginTop: 10, marginBottom: 8 },
  error: { ...type.meta, color: colors.danger, marginBottom: 10 },
  empty: { ...type.meta, color: colors.muted, marginVertical: 16 },
  repoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  repoIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  repoText: { flex: 1, gap: 2 },
  repoName: { ...type.row, fontSize: 16, fontWeight: "500" },
  repoMeta: { ...type.meta, fontSize: 12, color: colors.muted },
  localBlock: { marginTop: 22, gap: 8 },
  input: {
    ...type.body,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.row,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.ink,
    fontFamily: fonts.mono,
    fontSize: 14,
  },
  localBtn: {
    marginTop: 4,
    backgroundColor: colors.ink,
    borderRadius: radii.row,
    paddingVertical: 14,
    alignItems: "center",
  },
  localBtnDisabled: { opacity: 0.35 },
  localBtnText: { ...type.row, color: "#fff", fontWeight: "600", fontSize: 16 },
  pressed: { opacity: 0.7 },
});
