import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { PairedHost } from "@prime-pocket/protocol";

const KEY = "prime-pocket.paired-hosts";

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
