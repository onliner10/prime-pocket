import type { ComponentType } from "react";
import { useState } from "react";
import type { IconProps } from "@tamagui/helpers-icon";
import {
  ArrowUp,
  ChevronDown,
  GitBranch,
  Github,
  Mic,
  Plus,
  X,
} from "@tamagui/lucide-icons-2";
import {
  Button,
  Image,
  Input,
  ScrollView,
  SizableText,
  styled,
  XStack,
  YStack,
} from "tamagui";

export type PendingImage = {
  id: string;
  uri: string;
  mimeType: string;
  dataBase64: string;
  name?: string;
};

const RoundButton = styled(Button, {
  name: "ComposerRoundButton",
  circular: true,
  width: 42,
  height: 42,
  p: 0,
  bg: "$color4",
  borderWidth: 0,
  transition: "quicker",
  hoverStyle: { bg: "$color5" },
  pressStyle: { bg: "$color5", scale: 0.9 },
  disabledStyle: { opacity: 1 },

  variants: {
    ready: {
      true: {
        theme: "accent",
        bg: "$background",
        hoverStyle: { bg: "$backgroundHover" },
        pressStyle: { bg: "$backgroundPress", scale: 0.9 },
      },
    },
  } as const,
});

/** Repository / branch selector shown above the prompt field. */
function ContextChip({
  label,
  ariaLabel,
  icon: Icon,
  onPress,
  disabled,
}: {
  label: string;
  ariaLabel: string;
  icon: ComponentType<IconProps>;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <XStack
      role="button"
      aria-label={ariaLabel}
      onPress={disabled || !onPress ? undefined : onPress}
      items="center"
      gap={5}
      grow={1}
      shrink={1}
      minW={0}
      maxW="100%"
      px={10}
      py={6}
      rounded={999}
      bg="$color3"
      cursor="pointer"
      transition="quicker"
      hoverStyle={{ bg: "$color4" }}
      pressStyle={{ bg: "$color4", scale: 0.98 }}
    >
      <Icon size={14} color="$color10" strokeWidth={1.8} />
      <SizableText
        shrink={1}
        fontSize="$3"
        fontWeight="600"
        color="$color"
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {label}
      </SizableText>
      <ChevronDown size={14} color="$color9" strokeWidth={2.2} />
    </XStack>
  );
}

/**
 * Cursor-like composer. Workspace and branch are separate selectors on the
 * card so a typed prompt always shows both destination contexts.
 *
 * Focused (or with attachments) it expands into a sheet so the text field
 * stays clearly visible above the keyboard. Tree shape stays stable across
 * focus so the input is not remounted (which would dismiss the keyboard).
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
  workspaceLabel,
  branchLabel,
  onWorkspacePress,
  onBranchPress,
  workspaceIcon = Github,
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
  /** Repository / workspace, e.g. "acme/checkout-web" */
  workspaceLabel?: string | null;
  /** Branch / worktree, e.g. "feat/hello-world" */
  branchLabel?: string | null;
  onWorkspacePress?: () => void;
  onBranchPress?: () => void;
  workspaceIcon?: ComponentType<IconProps>;
}) {
  const [focused, setFocused] = useState(false);
  const hasImages = pendingImages.length > 0;
  const hasContext = Boolean(workspaceLabel?.trim() || branchLabel?.trim());
  const expanded = focused || hasImages || hasContext;
  const canSend = !sending && (value.trim().length > 0 || hasImages);

  function setFocus(next: boolean) {
    setFocused(next);
    onFocusChange?.(next);
  }

  const plusButton = imagesEnabled ? (
    <RoundButton aria-label="Add" onPress={onPlus} disabled={sending}>
      <Plus size={20} color="$color" strokeWidth={2} />
    </RoundButton>
  ) : (
    <YStack width={42} height={42} />
  );

  const sendButton = (
    <RoundButton aria-label="Send" ready={canSend} onPress={onSubmit} disabled={!canSend}>
      {canSend ? (
        <ArrowUp size={19} color="$color" strokeWidth={2.1} />
      ) : (
        <Mic size={19} color="$color9" strokeWidth={1.85} />
      )}
    </RoundButton>
  );

  return (
    <YStack width="100%" pointerEvents="box-none">
      <YStack
        bg={expanded ? "$color1" : "$color2"}
        rounded={expanded ? 24 : 999}
        px={expanded ? 10 : 6}
        pt={expanded ? 8 : 6}
        pb={expanded ? 7 : 6}
        borderWidth={1}
        borderColor="$color3"
        shadowColor="$shadowColor"
        shadowOpacity={1}
        shadowRadius={20}
        shadowOffset={{ width: 0, height: 8 }}
        elevationAndroid={8}
        transition="quick"
      >
        <YStack
          self="center"
          width={36}
          height={expanded ? 4 : 0}
          mb={expanded ? 8 : 0}
          opacity={expanded ? 1 : 0}
          rounded={2}
          bg="$color5"
          aria-hidden
        />

        {hasContext ? (
          <XStack items="center" gap={6} mb={2} px={2}>
            {workspaceLabel?.trim() ? (
              <ContextChip
                label={workspaceLabel.trim()}
                ariaLabel={`Workspace selector, ${workspaceLabel.trim()}`}
                icon={workspaceIcon}
                onPress={onWorkspacePress}
                disabled={sending}
              />
            ) : null}
            {branchLabel?.trim() ? (
              <ContextChip
                label={branchLabel.trim()}
                ariaLabel={`Branch selector, ${branchLabel.trim()}`}
                icon={GitBranch}
                onPress={onBranchPress}
                disabled={sending}
              />
            ) : null}
          </XStack>
        ) : null}

        {hasImages ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            maxH={88}
            mb={2}
            contentContainerStyle={{ flexDirection: "row", paddingBottom: 4 }}
          >
            {pendingImages.map((img) => (
              <YStack key={img.id} mr={10} enterStyle={{ opacity: 0, scale: 0.9 }} transition="quick">
                <Image source={{ uri: img.uri }} width={72} height={72} rounded={14} bg="$color3" />
                <Button
                  aria-label="Remove image"
                  circular
                  position="absolute"
                  t={4}
                  r={4}
                  width={22}
                  height={22}
                  p={0}
                  bg="$shadow7"
                  borderWidth={0}
                  hitSlop={8}
                  disabled={sending}
                  onPress={() => onRemoveImage?.(img.id)}
                >
                  <X size={11} color="$color1" strokeWidth={2.6} />
                </Button>
              </YStack>
            ))}
          </ScrollView>
        ) : null}

        <XStack items={expanded ? "stretch" : "center"}>
          {expanded ? null : plusButton}
          <Input
            key="composer-input"
            grow={1}
            shrink={1}
            minW={0}
            unstyled
            bg="transparent"
            borderWidth={0}
            outlineWidth={0}
            color="$color"
            fontFamily="$body"
            fontSize="$6"
            lineHeight={21}
            px={11}
            py={8}
            minH={expanded ? 88 : 42}
            maxH={expanded ? 160 : undefined}
            pt={expanded ? 6 : 8}
            pb={expanded ? 8 : 8}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="$color8"
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onSubmitEditing={() => {
              if (canSend) onSubmit?.();
            }}
            returnKeyType="send"
            multiline={expanded}
            blurOnSubmit={!expanded}
            readOnly={sending}
            textAlignVertical={expanded ? "top" : "center"}
          />
          {expanded ? null : sendButton}
        </XStack>

        {expanded ? (
          <XStack items="center" mt={2}>
            {plusButton}
            <YStack grow={1} />
            {sendButton}
          </XStack>
        ) : null}
      </YStack>
    </YStack>
  );
}
