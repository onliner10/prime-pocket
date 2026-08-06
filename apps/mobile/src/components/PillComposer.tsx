import { Image, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { colors, radii, shadows, type } from "../theme";
import { Icon } from "./Icon";

export type PendingImage = {
  id: string;
  uri: string;
  mimeType: string;
  dataBase64: string;
  name?: string;
};

/**
 * Cursor-like composer. Empty, it is a single floating pill: round +, prompt
 * field, round mic/send. With attachments it grows into a card so thumbnails
 * can sit above the text with the controls on their own toolbar row.
 */
export function PillComposer({
  value,
  onChangeText,
  onSubmit,
  onPlus,
  placeholder = "Plan, ask, build...",
  pendingImages = [],
  onRemoveImage,
  sending = false,
  imagesEnabled = true,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit?: () => void;
  onPlus?: () => void;
  placeholder?: string;
  pendingImages?: PendingImage[];
  onRemoveImage?: (id: string) => void;
  sending?: boolean;
  imagesEnabled?: boolean;
}) {
  const hasImages = pendingImages.length > 0;
  const canSend = !sending && (value.trim().length > 0 || hasImages);

  const plusButton = imagesEnabled ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add"
      onPress={onPlus}
      style={({ pressed }) => [styles.round, styles.roundIdle, pressed && styles.pressed]}
      disabled={sending}
    >
      <Icon name="plus" size={20} color={colors.ink} strokeWidth={2} />
    </Pressable>
  ) : (
    <View style={styles.round} />
  );

  const sendButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Send"
      onPress={onSubmit}
      style={({ pressed }) => [
        styles.round,
        canSend ? styles.roundReady : styles.roundIdle,
        pressed && styles.pressed,
      ]}
      disabled={!canSend}
    >
      {canSend ? (
        <Icon name="arrowUp" size={19} color="#fff" strokeWidth={2.1} />
      ) : (
        <Icon name="mic" size={19} color={colors.muted} strokeWidth={1.85} />
      )}
    </Pressable>
  );

  const field = (
    <TextInput
      style={[styles.input, hasImages && styles.inputExpanded]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted2}
      onSubmitEditing={() => {
        if (canSend) onSubmit?.();
      }}
      returnKeyType="send"
      multiline={hasImages}
      blurOnSubmit={!hasImages}
      editable={!sending}
    />
  );

  if (!hasImages) {
    return (
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={styles.pill}>
          {plusButton}
          {field}
          {sendButton}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.previews}
          contentContainerStyle={styles.previewsContent}
        >
          {pendingImages.map((img) => (
            <View key={img.id} style={styles.previewWrap}>
              <Image source={{ uri: img.uri }} style={styles.preview} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove image"
                style={styles.remove}
                onPress={() => onRemoveImage?.(img.id)}
                hitSlop={8}
                disabled={sending}
              >
                <Icon name="close" size={11} color="#fff" strokeWidth={2.6} />
              </Pressable>
            </View>
          ))}
        </ScrollView>

        {field}

        <View style={styles.toolbar}>
          {plusButton}
          <View style={styles.toolbarSpacer} />
          {sendButton}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderRadius: radii.pill,
    padding: 7,
    ...shadows.floating,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 24,
    paddingHorizontal: 11,
    paddingTop: 11,
    paddingBottom: 7,
    ...shadows.floating,
  },
  previews: { maxHeight: 88, marginBottom: 2 },
  previewsContent: { flexDirection: "row", alignItems: "flex-start", paddingBottom: 4 },
  previewWrap: { marginRight: 10, position: "relative" },
  preview: { width: 72, height: 72, borderRadius: 14, backgroundColor: colors.chip },
  remove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.66)",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    ...type.input,
    flex: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
    minHeight: 40,
    borderWidth: 0,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  inputExpanded: {
    flex: 0,
    minHeight: 44,
    paddingTop: 6,
    paddingBottom: 8,
    textAlignVertical: "top",
  },
  toolbar: { flexDirection: "row", alignItems: "center" },
  toolbarSpacer: { flex: 1 },
  round: {
    width: 42,
    height: 42,
    borderRadius: radii.circle,
    alignItems: "center",
    justifyContent: "center",
  },
  roundIdle: { backgroundColor: colors.chip },
  roundReady: { backgroundColor: colors.ink },
  pressed: { opacity: 0.6 },
});
