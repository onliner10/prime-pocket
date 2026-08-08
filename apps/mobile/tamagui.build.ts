import type { TamaguiBuildOptions } from "@tamagui/static";

/**
 * Single source of Tamagui compiler options — the Metro plugin, the Babel
 * plugin and the `tamagui` CLI all read this file, so the options cannot drift
 * between them.
 */
export default {
  config: "./tamagui.config.ts",
  components: ["tamagui"],
  // Dev keeps the runtime path so Fast Refresh and the Playwright proofs never
  // wait on the optimizing compiler.
  disableExtraction: process.env.NODE_ENV === "development",
} satisfies TamaguiBuildOptions;
