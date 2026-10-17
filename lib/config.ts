/**
 * Sign in with Apple. Requires:
 *   - `expo-apple-authentication` in app.json plugins and
 *     `"usesAppleSignIn": true` under `ios` (adds the entitlement via CNG).
 *   - The Apple provider enabled in Supabase with the app's bundle id as the
 *     client id (supabase/config.toml → `supabase config push`).
 *   - A dev-client rebuild after the entitlement change (`npx expo run:ios`).
 */
export const APPLE_SIGN_IN_ENABLED = true;
