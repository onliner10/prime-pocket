import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radii } from "../theme";
import { IconGlyph } from "./CircleButton";

export type PendingImage = {
  id: string;
  uri: string;
  mimeType: string;
  dataBase64: string;
  name?: string;
};

/**
 * Cursor-like composer: one floating card.
 * With attachments, thumbnails sit inside the card above the text;
 * + / send stay on a toolbar row at the bottom of the same card.
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

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.card, hasImages && styles.cardExpanded]}>
        {hasImages ? (
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
                  accessibilityLabel="Remove image"
                  style={styles.remove}
                  onPress={() => onRemoveImage?.(img.id)}
                  hitSlop={8}
                  disabled={sending}
                >
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

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

        <View style={styles.toolbar}>
          {imagesEnabled ? (
            <Pressable
              accessibilityLabel="Add"
              onPress={onPlus}
              style={styles.plus}
              disabled={sending}
            >
              <IconGlyph label="+" size={22} color={colors.ink} />
            </Pressable>
          ) : (
            <View style={styles.plusPlaceholder} />
          )}
          <View style={styles.toolbarSpacer} />
          <Pressable
            accessibilityLabel="Send"
            onPress={onSubmit}
            style={[styles.send, canSend ? styles.sendReady : styles.sendIdle]}
            disabled={!canSend}
          >
            <IconGlyph label="↑" size={18} color={canSend ? "#fff" : colors.muted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardExpanded: {
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  previews: {
    maxHeight: 88,
    marginBottom: 4,
  },
  previewsContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingBottom: 4,
  },
  previewWrap: {
    marginRight: 10,
    position: "relative",
  },
  preview: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: colors.codeBg,
  },
  remove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: "#fff", fontSize: 11, fontWeight: "700", marginTop: -1 },
  input: {
    fontSize: 16,
    color: colors.ink,
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 40,
    borderWidth: 0,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  inputExpanded: {
    minHeight: 44,
    paddingTop: 6,
    paddingBottom: 10,
    textAlignVertical: "top",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 2,
  },
  toolbarSpacer: { flex: 1 },
  plus: {
    width: 40,
    height: 40,
    borderRadius: radii.circle,
    backgroundColor: colors.codeBg,
    alignItems: "center",
    justifyContent: "center",
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: radii.circle,
    alignItems: "center",
    justifyContent: "center",
  },
  sendReady: {
    backgroundColor: colors.ink,
  },
  sendIdle: {
    backgroundColor: colors.codeBg,
  },
  plusPlaceholder: {
    width: 40,
    height: 40,
  },
});
