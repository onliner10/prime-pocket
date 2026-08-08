import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, shadows, type } from "../theme";
import { Icon, type IconName } from "./Icon";

export function WorkspaceRow({
  name,
  subtitle,
  onPress,
  variant = "card",
  icon = "folder",
  selected = false,
}: {
  name: string;
  subtitle?: string;
  onPress?: () => void;
  /** "plain" drops the card chrome for rows nested inside another card. */
  variant?: "card" | "plain";
  icon?: IconName;
  selected?: boolean;
}) {
  const card = variant === "card";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${name}, ${subtitle}` : name}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        card ? styles.rowCard : styles.rowPlain,
        selected && styles.rowSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.left}>
        <View style={[styles.folder, !card && styles.folderPlain]}>
          <Icon name={icon} size={18} color={colors.ink2} strokeWidth={1.7} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
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
  rowPlain: {
    paddingVertical: 13,
    paddingLeft: 0,
    paddingRight: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowSelected: {
    backgroundColor: "#F0F4F8",
  },
  pressed: { opacity: 0.7 },
  left: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  textCol: { flex: 1, gap: 1 },
  folder: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  folderPlain: {
    width: 24,
    height: 24,
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  name: { ...type.row, fontSize: 18, lineHeight: 23, fontWeight: "400" },
  subtitle: { ...type.meta, fontSize: 12, fontWeight: "400", color: colors.muted },
});
