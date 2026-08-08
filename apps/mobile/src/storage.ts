import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { PairedHost } from "@prime-pocket/protocol";

const KEY = "prime-pocket.paired-hosts";
const SELECTED_WORKSPACE_KEY = "prime-pocket.selected-workspace";

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function loadPairedHosts(): Promise<PairedHost[]> {
  const raw = await getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PairedHost[];
  } catch {
    return [];
  }
}

export async function savePairedHosts(hosts: PairedHost[]): Promise<void> {
  await setItem(KEY, JSON.stringify(hosts));
}

export async function upsertPairedHost(host: PairedHost): Promise<PairedHost[]> {
  const hosts = await loadPairedHosts();
  const next = [...hosts.filter((h) => h.hostId !== host.hostId), host];
  await savePairedHosts(next);
  return next;
}

export async function removePairedHost(hostId: string): Promise<PairedHost[]> {
  const hosts = (await loadPairedHosts()).filter((h) => h.hostId !== hostId);
  await savePairedHosts(hosts);
  return hosts;
}

/** Last workspace the user launched into / selected on a host. */
export async function loadSelectedWorkspaceId(hostId: string): Promise<string | null> {
  const raw = await getItem(SELECTED_WORKSPACE_KEY);
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return map[hostId] ?? null;
  } catch {
    return null;
  }
}

export async function saveSelectedWorkspaceId(hostId: string, workspaceId: string): Promise<void> {
  const raw = await getItem(SELECTED_WORKSPACE_KEY);
  let map: Record<string, string> = {};
  if (raw) {
    try {
      map = JSON.parse(raw) as Record<string, string>;
    } catch {
      map = {};
    }
  }
  map[hostId] = workspaceId;
  await setItem(SELECTED_WORKSPACE_KEY, JSON.stringify(map));
}
