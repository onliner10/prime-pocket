import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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
 * Cursor-like composer. Context (repo/branch) lives on the composer itself so a
 * typed prompt is never ambiguous about where it will run.
 *
 * Empty + no context: single floating pill.
 * With context or attachments: card with selector row above the prompt.
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
  contextLabel,
  contextHint,
  onContextPress,
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
  /** e.g. "feat/hello-world" or "checkout-web · feat/hello-world" */
  contextLabel?: string | null;
  /** Secondary line shown in a11y / empty state, e.g. repo full name */
  contextHint?: string | null;
  onContextPress?: () => void;
}) {
  const hasImages = pendingImages.length > 0;
  const hasContext = Boolean(contextLabel?.trim());
  const expanded = hasImages || hasContext;
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
      style={[styles.input, expanded && styles.inputExpanded]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted2}
      onSubmitEditing={() => {
        if (canSend) onSubmit?.();
      }}
      returnKeyType="send"
      multiline={expanded}
      blurOnSubmit={!expanded}
      editable={!sending}
    />
  );

  const contextChip = hasContext ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        contextLabel
          ? `Worktree selector, ${contextHint ? `${contextHint}, ` : ""}${contextLabel}`
          : "Worktree selector"
      }
      onPress={onContextPress}
      disabled={sending}
      style={({ pressed }) => [styles.contextChip, pressed && styles.pressed]}
    >
      <Icon name="gitBranch" size={14} color={colors.ink2} strokeWidth={1.8} />
      <Text style={styles.contextText} numberOfLines={1}>
        {contextLabel?.trim() || "Select worktree"}
      </Text>
      <Icon name="chevronDown" size={14} color={colors.muted} strokeWidth={2.2} />
    </Pressable>
  ) : null;

  if (!expanded) {
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
        {contextChip ? <View style={styles.contextRow}>{contextChip}</View> : null}

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
    backgroundColor: "rgba(242,242,242,0.96)",
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.95)",
    padding: 6,
    ...shadows.floating,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 7,
    ...shadows.floating,
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  contextChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F0F2F5",
  },
  contextText: {
    ...type.meta,
    color: colors.ink,
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
    letterSpacing: -0.2,
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
    minHeight: 42,
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
  roundIdle: { backgroundColor: "#E8E8E8" },
  roundReady: { backgroundColor: colors.ink },
  pressed: { opacity: 0.6 },
});
