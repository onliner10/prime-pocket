// Expo auto-configures monorepo watchFolders / nodeModulesPaths for SDK 52+.
// Keep this file minimal so Expo defaults stay intact.
const { getDefaultConfig } = require("expo/metro-config");
const { withTamagui } = require("@tamagui/metro-plugin");

// Tamagui ships its atomic styles as CSS on web.
const config = getDefaultConfig(__dirname, { isCSSEnabled: true });

// Every @tamagui/* package picks its platform build purely from the "exports"
// map (react-native vs browser) — there is no runtime platform flag to fall
// back on. Default-on in SDK 54, pinned here so a Metro default flip cannot
// silently ship the web build to native.
config.resolver.unstable_enablePackageExports = true;

// Resolves .css and validates the compiler options; reads tamagui.build.ts.
module.exports = withTamagui(config);
