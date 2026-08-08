import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Linking } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, Github, X } from "@tamagui/lucide-icons-2";
import { SizableText, Spinner, XStack, YStack } from "tamagui";
import type { GitHubStatus, PairedHost } from "@prime-pocket/protocol";
import { PocketHostClient } from "../src/api";
import { loadPairedHosts } from "../src/storage";
import {
  AppHeader,
  ErrorText,
  Field,
  FieldLabel,
  Gutter,
  HeaderSpacer,
  HeaderTitle,
  IconButton,
  Lead,
  Meta,
  Mono,
  PrimaryButton,
  Screen,
  ScreenScroll,
  SecondaryButton,
  Surface,
} from "../src/ui";

const TOKEN_SETUP_URL =
  "https://github.com/settings/tokens/new?scopes=repo&description=Prime%20Pocket";

/** Fetch failures the platform reports with no HTTP status behind them. */
const UNREACHABLE = /network request failed|failed to fetch|load failed|timed out|aborted/i;

function describeError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (UNREACHABLE.test(message)) {
    return "Can't reach the bridge. Check that prime-pocket bridge is running on the host and that this phone is on the same LAN or tailnet.";
  }
  return message;
}

/**
 * Connect GitHub on the paired host.
 * Live hosts prefer browser device-flow (Cursor-style); PAT paste remains a fallback.
 * Demo bridges keep one-tap mock connect.
 */
export default function GitHubConnectScreen() {
  const router = useRouter();
  const [host, setHost] = useState<PairedHost | null>(null);
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [token, setToken] = useState("");
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    setChecking(true);
    try {
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
        setStatus(null);
        setError(describeError(e));
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => stopPoll();
    }, [refresh, stopPoll]),
  );

  // Poll the bridge while a device-flow authorization is outstanding.
  useEffect(() => {
    stopPoll();
    if (!host || !status?.oauth || status.connected) return;

    const intervalMs = Math.max(2, status.oauth.interval ?? 5) * 1000;
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const client = new PocketHostClient(host);
          const next = await client.githubStatus();
          setStatus(next);
          if (next.connected || !next.oauth) {
            stopPoll();
          }
        } catch {
          // Keep waiting; transient LAN blips are common on mobile.
        }
      })();
    }, intervalMs);

    return () => stopPoll();
  }, [host, status?.oauth?.userCode, status?.connected, status?.oauth?.interval, stopPoll]);

  async function retry() {
    if (busy) return;
    setBusy(true);
    try {
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function connectMock() {
    if (!host || busy) return;
    setBusy(true);
    setError(null);
    try {
      const client = new PocketHostClient(host);
      setStatus(await client.connectGitHub({ mode: "mock" }));
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function connectOAuth() {
    if (!host || busy) return;
    setBusy(true);
    setError(null);
    try {
      const client = new PocketHostClient(host);
      const next = await client.connectGitHub({ mode: "oauth" });
      setStatus(next);
      const uri = next.oauth?.verificationUri;
      if (uri) {
        await Linking.openURL(uri);
      }
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function openVerification() {
    const uri = status?.oauth?.verificationUri;
    if (!uri) return;
    await Linking.openURL(uri);
  }

  async function connectToken() {
    if (!host || busy) return;
    const value = token.trim();
    if (!value) {
      setError("Paste a personal access token first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const client = new PocketHostClient(host);
      const next = await client.connectGitHub({ mode: "token", token: value });
      setStatus(next);
      setToken("");
      setShowTokenForm(false);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!host || busy) return;
    setBusy(true);
    setError(null);
    stopPoll();
    try {
      const client = new PocketHostClient(host);
      setStatus(await client.disconnectGitHub());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const oauthPending = Boolean(status?.oauth && !status.connected);
  const oauthExpired =
    oauthPending && status?.oauth ? Date.parse(status.oauth.expiresAt) <= Date.now() : false;

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

      <ScreenScroll>
        <Gutter pt={8} pb={32}>
          <Lead mb={18}>
            GitHub lives on your paired host. Pocket never stores a GitHub token in the cloud — the
            bridge holds the connection.
          </Lead>

          {checking && !status ? (
            <Surface p={16} gap={12} flexDirection="row" items="center">
              <Spinner size="small" color="$color8" />
              <Meta>
                {host ? `Checking GitHub on ${host.label}…` : "Looking for a paired host…"}
              </Meta>
            </Surface>
          ) : !host ? (
            <Surface p={16} gap={14}>
              <YStack>
                <CardTitle>Pair a host first</CardTitle>
                <Meta mt={3}>GitHub connects through the desktop bridge.</Meta>
              </YStack>
              <PrimaryButton
                role="button"
                aria-label="Pair host"
                onPress={() => router.push("/pair")}
              >
                Pair host
              </PrimaryButton>
            </Surface>
          ) : !status ? (
            <Surface p={16} gap={14}>
              <YStack>
                <CardTitle>Host unreachable</CardTitle>
                <Meta mt={3}>
                  {error ??
                    `No answer from ${host.label}. Start the bridge on that machine and try again.`}
                </Meta>
                <Meta mt={8}>
                  Paired at <Mono>{host.baseUrl}</Mono>
                </Meta>
              </YStack>
              <PrimaryButton
                role="button"
                aria-label="Retry"
                disabled={busy}
                onPress={() => void retry()}
                icon={busy ? <Spinner size="small" color="$color" /> : undefined}
              >
                Retry
              </PrimaryButton>
              <SecondaryButton
                role="button"
                aria-label="Manage hosts"
                onPress={() => router.push("/hosts")}
              >
                Manage hosts
              </SecondaryButton>
            </Surface>
          ) : status.connected ? (
            <Surface p={16} gap={14} theme="success">
              <XStack gap={12} items="flex-start">
                <Github size={22} color="$color11" strokeWidth={1.7} />
                <YStack flex={1}>
                  <CardTitle>
                    Connected
                    {status.mock ? " · mock" : status.mode === "oauth" ? " · browser" : ""}
                  </CardTitle>
                  <Meta mt={3}>Signed in as {status.login ?? "GitHub"}</Meta>
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
                    {status.mockAvailable
                      ? "This host supports mock GitHub for demos — no credentials needed."
                      : oauthPending
                        ? "Finish signing in on github.com, then return here. The bridge waits for authorization."
                        : status.oauthAvailable
                          ? `Sign in with GitHub in the browser. The token stays on ${host.label}.`
                          : `Paste a personal access token. It stays on ${host.label} — the app never keeps a copy.`}
                  </Meta>
                </YStack>
              </XStack>

              {status.mockAvailable ? (
                <PrimaryButton
                  role="button"
                  aria-label="Use mock GitHub"
                  disabled={busy}
                  onPress={() => void connectMock()}
                  icon={busy ? <Spinner size="small" color="$color" /> : undefined}
                >
                  Use mock GitHub
                </PrimaryButton>
              ) : oauthPending && status.oauth ? (
                <YStack gap={10}>
                  <FieldLabel>Enter this code on GitHub</FieldLabel>
                  <SizableText
                    aria-label={`GitHub device code ${status.oauth.userCode}`}
                    fontFamily="$mono"
                    fontSize={28}
                    letterSpacing={2}
                    text="center"
                    py={10}
                    color="$color"
                  >
                    {status.oauth.userCode}
                  </SizableText>
                  <Meta>
                    {oauthExpired
                      ? "This code expired. Start again to get a new one."
                      : "Waiting for you to authorize in the browser…"}
                  </Meta>
                  <PrimaryButton
                    role="button"
                    aria-label="Open GitHub"
                    onPress={() => void openVerification()}
                  >
                    Open GitHub
                  </PrimaryButton>
                  {oauthExpired ? (
                    <SecondaryButton
                      role="button"
                      aria-label="Start again"
                      disabled={busy}
                      onPress={() => void connectOAuth()}
                      icon={busy ? <Spinner size="small" color="$color" /> : undefined}
                    >
                      Start again
                    </SecondaryButton>
                  ) : (
                    <XStack gap={10} items="center" py={4}>
                      <Spinner size="small" color="$color8" />
                      <Meta>Listening on the host…</Meta>
                    </XStack>
                  )}
                </YStack>
              ) : (
                <YStack gap={10}>
                  {status.oauthAvailable ? (
                    <PrimaryButton
                      role="button"
                      aria-label="Continue with GitHub"
                      disabled={busy}
                      onPress={() => void connectOAuth()}
                      icon={busy ? <Spinner size="small" color="$color" /> : undefined}
                    >
                      Continue with GitHub
                    </PrimaryButton>
                  ) : null}

                  {showTokenForm || !status.oauthAvailable ? (
                    <YStack gap={10}>
                      <FieldLabel htmlFor="github-token">Personal access token</FieldLabel>
                      <Field
                        id="github-token"
                        aria-label="GitHub personal access token"
                        value={token}
                        onChangeText={setToken}
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="ghp_…"
                        onSubmitEditing={() => void connectToken()}
                        returnKeyType="go"
                      />
                      <Meta>
                        A classic token needs the <Mono>repo</Mono> scope; a fine-grained token
                        needs read access to Contents and Metadata.
                      </Meta>
                      <XStack
                        role="link"
                        aria-label="Create a token on github.com"
                        items="center"
                        gap={4}
                        py={6}
                        cursor="pointer"
                        onPress={() => void Linking.openURL(TOKEN_SETUP_URL)}
                        pressStyle={{ opacity: 0.75 }}
                      >
                        <Meta fontWeight="600" fontSize={14} color="$color11">
                          Create a token on github.com
                        </Meta>
                        <ChevronRight size={15} color="$color11" strokeWidth={1.9} />
                      </XStack>
                      {status.oauthAvailable ? (
                        <SecondaryButton
                          role="button"
                          aria-label="Connect with token"
                          disabled={busy || !token.trim()}
                          onPress={() => void connectToken()}
                          icon={busy ? <Spinner size="small" color="$color" /> : undefined}
                          opacity={!token.trim() ? 0.35 : 1}
                        >
                          Connect with token
                        </SecondaryButton>
                      ) : (
                        <PrimaryButton
                          role="button"
                          aria-label="Connect with token"
                          disabled={busy || !token.trim()}
                          onPress={() => void connectToken()}
                          icon={busy ? <Spinner size="small" color="$color" /> : undefined}
                          opacity={!token.trim() ? 0.35 : 1}
                        >
                          Connect with token
                        </PrimaryButton>
                      )}
                    </YStack>
                  ) : (
                    <XStack
                      role="button"
                      aria-label="Use a personal access token instead"
                      items="center"
                      gap={4}
                      py={6}
                      cursor="pointer"
                      onPress={() => setShowTokenForm(true)}
                      pressStyle={{ opacity: 0.75 }}
                    >
                      <Meta fontWeight="600" fontSize={14} color="$color11">
                        Use a personal access token instead
                      </Meta>
                      <ChevronRight size={15} color="$color11" strokeWidth={1.9} />
                    </XStack>
                  )}
                </YStack>
              )}
            </Surface>
          )}

          {error && status ? <ErrorText mt={14}>{error}</ErrorText> : null}
        </Gutter>
      </ScreenScroll>
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
