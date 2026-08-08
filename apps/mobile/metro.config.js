// Expo auto-configures monorepo watchFolders / nodeModulesPaths for SDK 52+.
// Keep this file minimal so Expo defaults stay intact.
const { getDefaultConfig } = require("expo/metro-config");

// Tamagui ships its atomic styles as CSS on web.
const config = getDefaultConfig(__dirname, { isCSSEnabled: true });

// Every @tamagui/* package resolves its platform build through an "exports"
// map (react-native vs browser), which is how `process.env.TAMAGUI_TARGET`
// ends up pre-inlined. Default-on in SDK 54, pinned here so a Metro default
// flip cannot silently ship the web build to native.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
