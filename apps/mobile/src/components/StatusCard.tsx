import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";

export function StatusCard({
  title,
  count,
  icon,
  accent,
  onPress,
}: {
  title: string;
  count?: number | string;
  icon: string;
  accent: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: accent + "18" }]}>
        <Text style={[styles.icon, { color: accent }]}>{icon}</Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
        {count !== undefined ? (
          <Text style={styles.count}>
            {" "}
            {count}
          </Text>
        ) : null}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 112,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.card,
    padding: 14,
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 18, fontWeight: "700" },
  title: {
    marginTop: 18,
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
    lineHeight: 20,
  },
  count: {
    color: colors.muted,
    fontWeight: "500",
  },
});
