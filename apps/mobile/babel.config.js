module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "@tamagui/babel-plugin",
        {
          components: ["tamagui"],
          config: "./tamagui.config.ts",
          logTimings: true,
          // Dev keeps the runtime path so Fast Refresh and the Playwright
          // proofs never wait on the optimizing compiler; production builds
          // flatten to atomic CSS / StyleSheet.
          disableExtraction: process.env.NODE_ENV === "development",
        },
      ],
    ],
  };
};
