// Flat config (ESLint 9). Extends Expo's shared config and runs Prettier as a
// lint rule so `expo lint` flags unformatted files. https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    // Deno edge functions (URL imports + Deno globals) and generated/vendor dirs
    // don't fit the Expo/React Native ruleset.
    ignores: [
      'dist/*',
      '.expo/*',
      'node_modules/*',
      'ios/*',
      'android/*',
      'supabase/.temp/*',
      'supabase/functions/*',
    ],
  },
]);
