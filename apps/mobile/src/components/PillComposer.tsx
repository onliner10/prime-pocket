import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radii } from "../theme";
import { IconGlyph } from "./CircleButton";

export function PillComposer({
  value,
  onChangeText,
  onSubmit,
  onPlus,
  placeholder = "Plan, ask, build...",
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit?: () => void;
  onPlus?: () => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <Pressable
          accessibilityLabel="Add"
          onPress={onPlus}
          style={styles.plus}
        >
          <IconGlyph label="+" size={22} color={colors.ink} />
        </Pressable>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted2}
          onSubmitEditing={onSubmit}
          returnKeyType="send"
        />
        <Pressable
          accessibilityLabel="Voice"
          onPress={onSubmit}
          style={styles.mic}
        >
          <IconGlyph label="◉" size={16} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 56,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  plus: {
    width: 40,
    height: 40,
    borderRadius: radii.circle,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  mic: {
    width: 40,
    height: 40,
    borderRadius: radii.circle,
    alignItems: "center",
    justifyContent: "center",
  },
});
