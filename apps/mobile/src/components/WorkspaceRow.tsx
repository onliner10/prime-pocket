import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, shadows, type } from "../theme";
import { Icon } from "./Icon";

export function WorkspaceRow({
  name,
  onPress,
  variant = "card",
}: {
  name: string;
  onPress?: () => void;
  /** "plain" drops the card chrome for rows nested inside another card. */
  variant?: "card" | "plain";
}) {
  const card = variant === "card";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => [styles.row, card && styles.rowCard, pressed && card && styles.pressed]}
    >
      <View style={styles.left}>
        <View style={styles.folder}>
          <Icon name="folder" size={18} color={colors.ink2} strokeWidth={1.7} />
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <Icon name="chevronRight" size={16} color={colors.muted2} strokeWidth={2.1} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.row,
    paddingVertical: 15,
    paddingLeft: 14,
    paddingRight: 16,
    ...shadows.row,
  },
  pressed: { opacity: 0.7 },
  left: { flexDirection: "row", alignItems: "center", gap: 13, flex: 1 },
  folder: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { ...type.row, flex: 1 },
});
