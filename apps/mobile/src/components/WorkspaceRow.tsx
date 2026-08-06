import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, shadows, type } from "../theme";
import { Icon } from "./Icon";

export function WorkspaceRow({
  name,
  meta,
  onPress,
  variant = "card",
}: {
  name: string;
  meta?: string;
  onPress?: () => void;
  /** "plain" drops the card chrome for rows nested inside another card. */
  variant?: "card" | "plain";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        variant === "card" && styles.rowCard,
        pressed && variant === "card" && styles.pressed,
      ]}
    >
      <View style={styles.left}>
        <View style={styles.folder}>
          <Icon name="folder" size={17} color={colors.ink2} strokeWidth={1.7} />
        </View>
        <View style={styles.labels}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>
      <Icon name="chevronRight" size={17} color={colors.muted2} strokeWidth={2} />
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
    paddingVertical: 13,
    paddingLeft: 13,
    paddingRight: 15,
    ...shadows.row,
  },
  pressed: { opacity: 0.7 },
  left: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  folder: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  labels: { flex: 1, gap: 1 },
  name: type.row,
  meta: { ...type.meta, fontSize: 12, fontWeight: "400" },
});
