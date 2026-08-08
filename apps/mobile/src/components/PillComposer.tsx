import { useState } from "react";
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
 * Cursor-like composer. Empty and blurred, it is a single floating pill: round
 * +, prompt field, round mic/send. Focused (or with attachments) it expands
 * into a sheet so the text field stays clearly visible above the keyboard.
 *
 * Tree shape stays stable across focus so the TextInput is not remounted
 * (which would dismiss the keyboard).
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
  onFocusChange,
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
  onFocusChange?: (focused: boolean) => void;
}) {
  const [focused, setFocused] = useState(false);
  const hasImages = pendingImages.length > 0;
  const expanded = focused || hasImages;
  const canSend = !sending && (value.trim().length > 0 || hasImages);

  function setFocus(next: boolean) {
    setFocused(next);
    onFocusChange?.(next);
  }

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

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.surface, expanded ? styles.sheet : styles.pill]}>
        <View
          style={[styles.handle, !expanded && styles.handleHidden]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />

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
        ) : null}

        <View style={[styles.row, expanded && styles.rowExpanded]}>
          {!expanded ? plusButton : null}
          <TextInput
            key="composer-input"
            style={[styles.input, expanded && styles.inputExpanded]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.muted2}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onSubmitEditing={() => {
              if (canSend) onSubmit?.();
            }}
            returnKeyType="send"
            multiline={expanded}
            blurOnSubmit={!expanded}
            editable={!sending}
            textAlignVertical={expanded ? "top" : "center"}
          />
          {!expanded ? sendButton : null}
        </View>

        {expanded ? (
          <View style={styles.toolbar}>
            {plusButton}
            <View style={styles.toolbarSpacer} />
            {sendButton}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  surface: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.95)",
    ...shadows.floating,
  },
  pill: {
    flexDirection: "column",
    backgroundColor: "rgba(242,242,242,0.96)",
    borderRadius: radii.pill,
    padding: 6,
  },
  sheet: {
    backgroundColor: "rgba(252,252,252,0.98)",
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 7,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.12)",
    marginBottom: 8,
  },
  handleHidden: {
    height: 0,
    marginBottom: 0,
    opacity: 0,
    overflow: "hidden",
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
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowExpanded: {
    alignItems: "stretch",
  },
  input: {
    ...type.input,
    flex: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
    minHeight: 42,
    borderWidth: 0,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  inputExpanded: {
    minHeight: 88,
    maxHeight: 160,
    paddingTop: 6,
    paddingBottom: 8,
    textAlignVertical: "top",
  },
  toolbar: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  toolbarSpacer: { flex: 1 },
  round: {
    width: 42,
    height: 42,
    borderRadius: radii.circle,
    alignItems: "center",
    justifyContent: "center",
  },
  roundIdle: { backgroundColor: "#E8E8E8" },
  roundReady: { backgroundColor: colors.ink },
  pressed: { opacity: 0.6 },
});
