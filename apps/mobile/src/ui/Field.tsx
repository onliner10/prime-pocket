import { Input, Label, styled, TextArea } from "tamagui";

const fieldChrome = {
  bg: "$color1",
  borderWidth: 1,
  borderColor: "$color3",
  rounded: "$6",
  color: "$color",
  fontFamily: "$body",
  fontSize: "$6",
  px: 14,
  py: 13,
  placeholderTextColor: "$color8",
  transition: "quicker",
  focusStyle: { borderColor: "$color8", outlineWidth: 0 },
  hoverStyle: { borderColor: "$color4" },
} as const;

/** Single-line form field. */
export const Field = styled(Input, {
  name: "Field",
  unstyled: true,
  ...fieldChrome,
  height: 48,
});

/** Multi-line form field — a real <textarea> on web. */
export const FieldArea = styled(TextArea, {
  name: "FieldArea",
  unstyled: true,
  ...fieldChrome,
  minH: 90,
  textAlignVertical: "top",
});

export const FieldLabel = styled(Label, {
  name: "FieldLabel",
  fontSize: "$3",
  fontWeight: "600",
  color: "$color9",
  mt: 10,
  mb: 7,
  height: "auto",
  lineHeight: 18,
});
