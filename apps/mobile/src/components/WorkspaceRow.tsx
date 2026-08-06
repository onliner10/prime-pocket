import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { IconGlyph } from "./CircleButton";

export function WorkspaceRow({
  name,
  onPress,
}: {
  name: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.left}>
        <View style={styles.folder}>
          <IconGlyph label="📁" size={16} />
        </View>
        <Text style={styles.name}>{name}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  left: { flexDirection: "row", alignItems: "center", gap: 12 },
  folder: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.codeBg,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 17, color: colors.ink, fontWeight: "500" },
  chevron: { fontSize: 22, color: colors.muted2, fontWeight: "300" },
});
