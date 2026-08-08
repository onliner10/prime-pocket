import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * RN Web has no native status bar / home-indicator inset. Keep the web proof
 * viewport honest to the iPhone screenshots while the real insets remain the
 * source of truth on device.
 */
export const proofSafeArea = {
  top: Platform.OS === "web" ? 50 : 0,
  bottom: Platform.OS === "web" ? 34 : 0,
} as const;

/** Bottom padding a floating dock needs to clear the home indicator. */
export function useSafeBottom(): number {
  return useSafeAreaInsets().bottom + proofSafeArea.bottom;
}
