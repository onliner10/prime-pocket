import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { CheckCircle2 } from "@tamagui/lucide-icons-2";
import { H1, SizableText, Spinner, XStack, YStack } from "tamagui";
import type { GitHubStatus, PairedHost } from "@prime-pocket/protocol";
import { PocketHostClient } from "../src/api";
import { loadOnboardingComplete, loadPairedHosts, saveOnboardingComplete } from "../src/storage";
import {
  ChipButton,
  ErrorText,
  Gutter,
  IconTile,
  Lead,
  Meta,
  PrimaryButton,
  Screen,
  Surface,
} from "../src/ui";

type Step = 1 | 2 | 3;

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [hosts, setHosts] = useState<PairedHost[]>([]);
  const [github, setGithub] = useState<GitHubStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const paired = await loadPairedHosts();
    setHosts(paired);
    if (paired.length === 0) {
      setStep(1);
      setGithub(null);
      return;
    }
    try {
      const client = new PocketHostClient(paired[0]!);
      const status = await client.githubStatus();
      setGithub(status);
      if (!status.connected) setStep(2);
      else setStep(3);
    } catch {
      setStep(2);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        if (await loadOnboardingComplete()) {
          router.replace("/");
          return;
        }
        await refresh();
      })();
    }, [refresh, router]),
  );

  async function connectMockGitHub() {
    if (!hosts[0] || busy) return;
    setBusy(true);
    setError(null);
    try {
      const client = new PocketHostClient(hosts[0]);
      const status = await client.connectGitHub({ mode: "mock" });
      setGithub(status);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    await saveOnboardingComplete();
    router.replace("/repos/add");
  }

  const hostReady = hosts.length > 0;
  const githubReady = Boolean(github?.connected);

  return (
    <Screen bottomEdge>
      <Gutter flex={1} pt={28} pb={24}>
        <Meta fontWeight="600" mb={8}>
          Prime Pocket
        </Meta>
        <H1 fontSize="$10" fontWeight="500" color="$color" mb={10}>
          Get set up
        </H1>
        <Lead mb={28}>
          Connect your desktop bridge, then GitHub. After that you can add a repo and start an
          agent.
        </Lead>

        <YStack gap={12}>
          <StepRow
            index={1}
            title="Pair desktop bridge"
            body={
              hostReady
                ? `Connected to ${hosts[0]!.label}`
                : "Run the bridge on your machine, then enter URL + pair code."
            }
            done={hostReady}
            active={step === 1}
            actionLabel={hostReady ? undefined : "Pair host"}
            onAction={() => router.push("/pair")}
          />
          <StepRow
            index={2}
            title="Connect GitHub"
            body={
              githubReady
                ? `Signed in as ${github?.login ?? "GitHub"}${github?.mock ? " (mock)" : ""}`
                : github?.mockAvailable
                  ? "Use mock GitHub for demos, or connect a real account on a live host."
                  : "Continue with GitHub in the browser, or paste a token on the host."
            }
            done={githubReady}
            active={step === 2}
            actionLabel={
              !hostReady || githubReady
                ? undefined
                : github?.mockAvailable
                  ? "Use mock GitHub"
                  : "Connect GitHub"
            }
            onAction={
              !hostReady || githubReady
                ? undefined
                : github?.mockAvailable
                  ? () => void connectMockGitHub()
                  : () => router.push("/github")
            }
            busy={busy}
          />
          <StepRow
            index={3}
            title="Add a repository"
            body="Pick a repo, create a worktree, then send your first task."
            done={false}
            active={step === 3}
            actionLabel={hostReady && githubReady ? "Choose repository" : undefined}
            onAction={hostReady && githubReady ? () => void finish() : undefined}
          />
        </YStack>

        {error ? <ErrorText mt={14}>{error}</ErrorText> : null}

        <YStack flex={1} />

        {hostReady && githubReady ? (
          <PrimaryButton
            role="button"
            aria-label="Finish setup"
            onPress={() => void finish()}
            enterStyle={{ opacity: 0, y: 12 }}
            transition="medium"
          >
            Continue
          </PrimaryButton>
        ) : null}
      </Gutter>
    </Screen>
  );
}

/** One numbered setup task. The active step is outlined; a done step goes green. */
function StepRow({
  index,
  title,
  body,
  done,
  active,
  actionLabel,
  onAction,
  busy,
}: {
  index: number;
  title: string;
  body: string;
  done: boolean;
  active: boolean;
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
}) {
  return (
    <Surface
      flexDirection="row"
      gap={12}
      p={14}
      aria-selected={active}
      transition="quick"
      borderWidth={active ? 1.5 : 1}
      borderColor={active ? "$color11" : "$color3"}
    >
      <IconTile theme={done ? "success" : null}>
        {done ? (
          <CheckCircle2 size={18} color="$color10" strokeWidth={1.8} />
        ) : (
          <SizableText fontSize="$4" fontWeight="600" color="$color">
            {index}
          </SizableText>
        )}
      </IconTile>

      <YStack flex={1} gap={4}>
        <SizableText fontSize="$6" fontWeight="600" color="$color">
          {title}
        </SizableText>
        <Meta>{body}</Meta>
        {actionLabel && onAction ? (
          <ChipButton
            self="flex-start"
            mt={10}
            role="button"
            aria-label={actionLabel}
            disabled={busy}
            onPress={onAction}
            icon={busy ? <Spinner size="small" color="$color" /> : undefined}
          >
            {actionLabel}
          </ChipButton>
        ) : null}
      </YStack>
    </Surface>
  );
}
