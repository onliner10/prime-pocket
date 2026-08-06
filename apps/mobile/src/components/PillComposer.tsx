import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radii } from "../theme";
import { IconGlyph } from "./CircleButton";

export type PendingImage = {
  id: string;
  uri: string;
  mimeType: string;
  dataBase64: string;
  name?: string;
};

export function PillComposer({
  value,
  onChangeText,
  onSubmit,
  onPlus,
  placeholder = "Plan, ask, build...",
  pendingImages = [],
  onRemoveImage,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit?: () => void;
  onPlus?: () => void;
  placeholder?: string;
  pendingImages?: PendingImage[];
  onRemoveImage?: (id: string) => void;
}) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {pendingImages.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previews}>
          {pendingImages.map((img) => (
            <View key={img.id} style={styles.previewWrap}>
              <Image source={{ uri: img.uri }} style={styles.preview} />
              <Pressable
                accessibilityLabel="Remove image"
                style={styles.remove}
                onPress={() => onRemoveImage?.(img.id)}
              >
                <Text style={styles.removeText}>✕</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.bar}>
        <Pressable accessibilityLabel="Add" onPress={onPlus} style={styles.plus}>
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
        <Pressable accessibilityLabel="Send" onPress={onSubmit} style={styles.mic}>
          <IconGlyph label="↑" size={18} color={colors.ink} />
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
  previews: {
    marginBottom: 8,
    maxHeight: 72,
  },
  previewWrap: {
    marginRight: 8,
    position: "relative",
  },
  preview: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: colors.codeBg,
  },
  remove: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
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
