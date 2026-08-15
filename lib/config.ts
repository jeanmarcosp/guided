/**
 * Sign in with Apple is deferred until an Apple Developer account is available.
 * To re-enable:
 *   1. Set this to true.
 *   2. In app.json add `"expo-apple-authentication"` to plugins and
 *      `"usesAppleSignIn": true` under `ios`.
 *   3. Configure the Apple provider in Supabase (Authentication → Providers).
 *   4. Rebuild the dev client (`npx expo run:ios`).
 */
export const APPLE_SIGN_IN_ENABLED = false;
