import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { colors, radii } from "../theme";

export function CircleButton({
  onPress,
  children,
  style,
  accessibilityLabel,
}: {
  onPress?: () => void;
  children: ReactNode;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.circle, style]}
    >
      {children}
    </Pressable>
  );
}

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
    <Text style={{ color, fontSize: size, fontWeight: "500", lineHeight: size + 2 }}>{label}</Text>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 36,
    height: 36,
    borderRadius: radii.circle,
    backgroundColor: colors.bgElevated,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
