import { useCallback, useState } from "react";
import { FlatList } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Github, Plus, Search, X } from "@tamagui/lucide-icons-2";
import { SizableText, Spinner, XStack, YStack } from "tamagui";
import type { GitHubCatalogRepo, GitHubStatus, PairedHost } from "@prime-pocket/protocol";
import { PocketHostClient } from "../../src/api";
import { loadPairedHosts, saveSelectedWorkspaceId } from "../../src/storage";
import {
  AppHeader,
  ChipButton,
  ErrorText,
  Field,
  GUTTER,
  HeaderSpacer,
  HeaderTitle,
  IconButton,
  IconTile,
  Lead,
  Meta,
  PrimaryButton,
  Row,
  Screen,
  SectionLabel,
  Surface,
} from "../../src/ui";

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

  const refresh = useCallback(
    async (q?: string) => {
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
          setRepos([]);
          setLoading(false);
          router.replace("/github");
          return;
        }
        const catalog = await client.listGitHubRepos(q);
        setStatus(catalog.status);
        setRepos(catalog.repos);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

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
      router.replace({
        pathname: "/repos/[workspaceId]/worktree",
        params: { workspaceId: workspace.id },
      });
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
        repoRoot: localCwd.trim(),
      });
      await saveSelectedWorkspaceId(host.hostId, workspace.id);
      router.replace({
        pathname: "/repos/[workspaceId]/worktree",
        params: { workspaceId: workspace.id },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(null);
    }
  }

  const localReady = Boolean(localName.trim() && localCwd.trim());

  return (
    <Screen>
      <AppHeader mb={8}>
        <IconButton
          aria-label="Close"
          icon={<X size={16} strokeWidth={2.1} />}
          onPress={() => router.back()}
        />
        <HeaderTitle fontWeight="600">Add repository</HeaderTitle>
        <HeaderSpacer />
      </AppHeader>

      <FlatList
        data={repos}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <YStack mb={4}>
            <Lead mb={14}>
              Pick a GitHub repo to create a workspace. Next you create a worktree for the agent to
              work in.
            </Lead>

            {status?.connected ? (
              <XStack
                theme={status.mock ? "working" : null}
                aria-label={status.mock ? "GitHub mock mode" : undefined}
                items="center"
                gap={8}
                bg="$color2"
                rounded="$6"
                px={12}
                py={10}
                mb={14}
              >
                <Github size={16} color="$color11" strokeWidth={1.7} />
                <Meta flex={1} color="$color11">
                  {status.mock
                    ? `Mock GitHub · signed in as ${status.login ?? "demo"} — no credentials needed`
                    : `GitHub · ${status.login ?? "connected"}`}
                </Meta>
              </XStack>
            ) : null}

            <Surface
              flexDirection="row"
              items="center"
              gap={8}
              pl={12}
              pr={6}
              mb={12}
              flat
              rounded="$6"
            >
              <Search size={17} color="$color9" strokeWidth={1.9} />
              <Field
                flex={1}
                unstyled
                bg="transparent"
                borderWidth={0}
                px={0}
                py={12}
                height="auto"
                placeholder="Search repositories"
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => void refresh(query)}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <ChipButton
                height={32}
                px={12}
                role="button"
                aria-label="Search"
                onPress={() => void refresh(query)}
              >
                Go
              </ChipButton>
            </Surface>

            {error ? <ErrorText mb={10}>{error}</ErrorText> : null}
            {loading ? (
              <Spinner my={18} color="$color8" />
            ) : (
              <SectionLabel fontSize="$5" mt={10} mb={8}>
                From GitHub
              </SectionLabel>
            )}
          </YStack>
        }
        renderItem={({ item }) => (
          <Row
            divided
            interactive
            role="button"
            aria-label={`Add ${item.fullName}`}
            aria-disabled={Boolean(adding)}
            onPress={() => void addFromGitHub(item)}
          >
            <IconTile>
              <Github size={18} color="$color10" strokeWidth={1.7} />
            </IconTile>
            <YStack flex={1} gap={2}>
              <SizableText fontSize="$5" fontWeight="500" color="$color" numberOfLines={1}>
                {item.fullName}
              </SizableText>
              <Meta fontSize="$2" numberOfLines={2}>
                {[item.private ? "Private" : "Public", item.language, item.description]
                  .filter(Boolean)
                  .join(" · ")}
              </Meta>
            </YStack>
            {adding === item.fullName ? (
              <Spinner color="$color9" />
            ) : (
              <Plus size={18} color="$color" strokeWidth={2} />
            )}
          </Row>
        )}
        ListEmptyComponent={!loading ? <Meta my={16}>No repositories match.</Meta> : null}
        ListFooterComponent={
          <YStack mt={22} gap={8}>
            <SectionLabel fontSize="$5">Or local folder on host</SectionLabel>
            <Field
              fontFamily="$mono"
              fontSize="$4"
              placeholder="Name"
              value={localName}
              onChangeText={setLocalName}
            />
            <Field
              fontFamily="$mono"
              fontSize="$4"
              placeholder="/Users/you/src/my-repo"
              value={localCwd}
              onChangeText={setLocalCwd}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <PrimaryButton
              mt={4}
              role="button"
              aria-label="Add local folder"
              disabled={!localReady || Boolean(adding)}
              opacity={localReady ? 1 : 0.35}
              onPress={() => void addLocal()}
            >
              {adding === "local" ? "Adding…" : "Add local folder"}
            </PrimaryButton>
          </YStack>
        }
      />
    </Screen>
  );
}
