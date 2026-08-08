// Expo auto-configures monorepo watchFolders / nodeModulesPaths for SDK 52+.
// Keep this file minimal so Expo defaults stay intact.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
