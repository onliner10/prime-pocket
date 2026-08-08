module.exports = function (api) {
  // Expo's Metro transformer passes the target platform through the Babel
  // caller. Reading it via api.caller keys the config cache per platform, so
  // web and native bundles each get their own plugin list.
  const platform = api.caller((caller) => caller?.platform);

  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // @tamagui/babel-plugin only knows how to extract to React Native
      // StyleSheet — it hard-codes platform: 'native'. Running it over the web
      // bundle would compile away the atomic-CSS path that react-native-web
      // wants, so native is the only place it belongs. Options come from
      // tamagui.build.ts.
      ...(platform === "web" ? [] : ["@tamagui/babel-plugin"]),
    ],
  };
};
