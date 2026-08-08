import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown, ChevronLeft, GitBranch, Github } from "@tamagui/lucide-icons-2";
import { SizableText, Spinner } from "tamagui";
import type { GitHubBranch, PairedHost, Workspace } from "@prime-pocket/protocol";
import { PocketHostClient } from "../../../src/api";
import {
  loadPairedHosts,
  saveSelectedWorktreeId,
  saveSelectedWorkspaceId,
} from "../../../src/storage";
import {
  AppHeader,
  ErrorText,
  Gutter,
  HeaderSpacer,
  HeaderTitle,
  IconButton,
  Lead,
  Meta,
  PickerRow,
  PickerSheet,
  PrimaryButton,
  Screen,
  Surface,
} from "../../../src/ui";

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
      // Pop stacked screens so Inbox remounts/focuses with the new selection.
      router.dismissTo("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const canCreate = Boolean(branch?.trim()) && !busy && !loading;

  return (
    <Screen>
      <AppHeader mb={8}>
        <IconButton
          aria-label="Back"
          icon={<ChevronLeft size={19} strokeWidth={2} />}
          onPress={() => router.back()}
        />
        <HeaderTitle fontWeight="600">New worktree</HeaderTitle>
        <HeaderSpacer />
      </AppHeader>

      <Gutter pt={8} gap={8}>
        <Lead mb={12}>
          Create a branch worktree on the host. The agent will run inside this checkout.
        </Lead>

        <Meta mt={8}>Repository</Meta>
        <Surface flexDirection="row" items="center" gap={10} px={14} py={14} flat>
          <Github size={18} color="$color10" strokeWidth={1.7} />
          <SizableText flex={1} fontSize="$5" color="$color" numberOfLines={1}>
            {workspace?.fullName ?? workspace?.name ?? "…"}
          </SizableText>
        </Surface>

        <Meta mt={8}>Branch</Meta>
        {loading ? (
          <Spinner my={12} color="$color8" />
        ) : (
          <Surface
            role="button"
            aria-label="Branch dropdown"
            onPress={() => setPickerOpen(true)}
            flexDirection="row"
            items="center"
            gap={10}
            px={14}
            py={14}
            flat
            borderWidth={1.5}
            borderColor="$color11"
            cursor="pointer"
            transition="quicker"
            pressStyle={{ opacity: 0.75 }}
          >
            <GitBranch size={17} color="$color10" strokeWidth={1.7} />
            <SizableText flex={1} fontSize="$5" fontWeight="500" color="$color" numberOfLines={1}>
              {branch ?? "Select branch"}
            </SizableText>
            <ChevronDown size={16} color="$color9" strokeWidth={2} />
          </Surface>
        )}

        {error ? <ErrorText mt={6}>{error}</ErrorText> : null}

        <PrimaryButton
          mt={18}
          role="button"
          aria-label="Create worktree"
          disabled={!canCreate}
          opacity={canCreate ? 1 : 0.35}
          onPress={() => void create()}
          icon={busy ? <Spinner size="small" color="$color" /> : undefined}
        >
          Create worktree
        </PrimaryButton>
      </Gutter>

      <PickerSheet open={pickerOpen} onOpenChange={setPickerOpen} title="Select branch">
        {branches.map((b) => (
          <PickerRow
            key={b.name}
            label={b.name}
            ariaLabel={`Branch ${b.name}`}
            selected={b.name === branch}
            icon={<GitBranch size={16} color="$color10" strokeWidth={1.7} />}
            trailing={
              b.isDefault ? (
                <Meta fontSize="$1" bg="$color3" rounded={999} px={8} py={3}>
                  default
                </Meta>
              ) : null
            }
            onPress={() => {
              setBranch(b.name);
              setPickerOpen(false);
            }}
          />
        ))}
      </PickerSheet>
    </Screen>
  );
}
