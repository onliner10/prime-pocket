import { useCallback, useState, type ReactNode } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Github, X } from "@tamagui/lucide-icons-2";
import { SizableText, Spinner, XStack, YStack } from "tamagui";
import type { GitHubStatus, PairedHost } from "@prime-pocket/protocol";
import { PocketHostClient } from "../src/api";
import { loadPairedHosts } from "../src/storage";
import {
  AppHeader,
  ErrorText,
  Gutter,
  HeaderSpacer,
  HeaderTitle,
  IconButton,
  Lead,
  Meta,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Surface,
} from "../src/ui";

/**
 * Pair / connect GitHub on the paired host.
 * Demo bridges expose mock connect (no credentials). Live hosts will use OAuth/token later.
 */
export default function GitHubConnectScreen() {
  const router = useRouter();
  const [host, setHost] = useState<PairedHost | null>(null);
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const paired = await loadPairedHosts();
    const first = paired[0] ?? null;
    setHost(first);
    if (!first) {
      setStatus(null);
      return;
    }
    try {
      const client = new PocketHostClient(first);
      setStatus(await client.githubStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function connectMock() {
    if (!host || busy) return;
    setBusy(true);
    setError(null);
    try {
      const client = new PocketHostClient(host);
      setStatus(await client.connectGitHub({ mode: "mock" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!host || busy) return;
    setBusy(true);
    setError(null);
    try {
      const client = new PocketHostClient(host);
      setStatus(await client.disconnectGitHub());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const connected = Boolean(status?.connected);

  return (
    <Screen>
      <AppHeader mb={8}>
        <IconButton
          aria-label="Close"
          icon={<X size={16} strokeWidth={2.1} />}
          onPress={() => router.back()}
        />
        <HeaderTitle fontWeight="600">Connect GitHub</HeaderTitle>
        <HeaderSpacer />
      </AppHeader>

      <Gutter pt={8}>
        <Lead mb={18}>
          GitHub lives on your paired host. Pocket never stores a GitHub token in the cloud — the
          bridge holds the connection.
        </Lead>

        {!host ? (
          <Surface p={16} gap={14}>
            <YStack>
              <CardTitle>Pair a host first</CardTitle>
              <Meta mt={3}>GitHub connects through the desktop bridge.</Meta>
            </YStack>
            <PrimaryButton role="button" aria-label="Pair host" onPress={() => router.push("/pair")}>
              Pair host
            </PrimaryButton>
          </Surface>
        ) : connected ? (
          <Surface p={16} gap={14} theme="success">
            <XStack gap={12} items="flex-start">
              <Github size={22} color="$color11" strokeWidth={1.7} />
              <YStack flex={1}>
                <CardTitle>Connected{status?.mock ? " · mock" : ""}</CardTitle>
                <Meta mt={3}>Signed in as {status?.login ?? "GitHub"}</Meta>
              </YStack>
            </XStack>
            <SecondaryButton
              role="button"
              aria-label="Disconnect GitHub"
              disabled={busy}
              onPress={() => void disconnect()}
              icon={busy ? <Spinner size="small" color="$color" /> : undefined}
            >
              Disconnect
            </SecondaryButton>
            <PrimaryButton role="button" aria-label="Done" onPress={() => router.back()}>
              Done
            </PrimaryButton>
          </Surface>
        ) : (
          <Surface p={16} gap={14}>
            <XStack gap={12} items="flex-start">
              <Github size={22} color="$color" strokeWidth={1.7} />
              <YStack flex={1}>
                <CardTitle>Not connected</CardTitle>
                <Meta mt={3}>
                  {status?.mockAvailable
                    ? "This host supports mock GitHub for demos — no credentials needed."
                    : "Authorize GitHub on the host to list repositories and branches."}
                </Meta>
              </YStack>
            </XStack>

            {status?.mockAvailable ? (
              <PrimaryButton
                role="button"
                aria-label="Use mock GitHub"
                disabled={busy}
                onPress={() => void connectMock()}
                icon={busy ? <Spinner size="small" color="$color" /> : undefined}
              >
                Use mock GitHub
              </PrimaryButton>
            ) : (
              <YStack bg="$color3" rounded="$6" p={12}>
                <Meta>
                  Live OAuth/token pairing is not wired in this build. Start the bridge with
                  `--demo` to use mock GitHub.
                </Meta>
              </YStack>
            )}
          </Surface>
        )}

        {error ? <ErrorText mt={14}>{error}</ErrorText> : null}
      </Gutter>
    </Screen>
  );
}

function CardTitle({ children }: { children: ReactNode }) {
  return (
    <SizableText fontSize="$6" fontWeight="600" color="$color">
      {children}
    </SizableText>
  );
}
