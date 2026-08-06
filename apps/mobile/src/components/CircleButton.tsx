import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { colors, fonts, radii, shadows } from "../theme";

export function CircleButton({
  onPress,
  children,
  style,
  size = 38,
  tone = "elevated",
  accessibilityLabel,
}: {
  onPress?: () => void;
  children: ReactNode;
  style?: ViewStyle;
  size?: number;
  tone?: "elevated" | "sunken" | "bare";
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.circle,
        { width: size, height: size },
        tone === "elevated" && styles.elevated,
        tone === "sunken" && styles.sunken,
        pressed && styles.pressed,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** Text-based glyph fallback for the few places a real icon is overkill. */
export function IconGlyph({
  label,
  color = colors.ink,
  size = 18,
}: {
  label: string;
  color?: string;
  size?: number;
}) {
  return (
    <Text
      style={{
        fontFamily: fonts.sans,
        color,
        fontSize: size,
        fontWeight: "500",
        lineHeight: size + 2,
      }}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderRadius: radii.circle,
    alignItems: "center",
    justifyContent: "center",
  },
  elevated: {
    backgroundColor: colors.bgElevated,
    ...shadows.control,
  },
  sunken: {
    backgroundColor: colors.chip,
  },
  pressed: {
    opacity: 0.55,
  },
});
