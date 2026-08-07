import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, shadows, type } from "../theme";
import { Icon, type IconName } from "./Icon";

export function StatusCard({
  title,
  count,
  icon,
  accent,
  onPress,
}: {
  title: string;
  count?: number | string;
  icon: IconName;
  accent: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count === undefined ? title : `${title} ${count}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.iconRow}>
        <Icon name={icon} size={25} color={accent} strokeWidth={2} />
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
        {count !== undefined ? <Text style={styles.count}> {count}</Text> : null}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 108,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingTop: 15,
    paddingBottom: 16,
    justifyContent: "space-between",
    ...shadows.card,
  },
  pressed: { opacity: 0.7 },
  iconRow: { height: 25, justifyContent: "center" },
  title: { ...type.cardLabel, fontSize: 17, lineHeight: 21, fontWeight: "400", letterSpacing: -0.4, marginTop: 22 },
  count: { color: colors.muted, fontWeight: "400" },
});
