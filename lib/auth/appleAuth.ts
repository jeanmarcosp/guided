import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '@/lib/supabase';

export const isAppleAuthAvailable = AppleAuthentication.isAvailableAsync;

/**
 * Sign in with Apple, then exchange the returned identity token for a Supabase
 * session. Apple only returns the user's name on the FIRST authorization, so we
 * capture it here and pass it as user metadata (the profile trigger reads it).
 */
export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple Sign In failed: no identity token returned.');
  }

  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  // Persist the display name on first sign-in (Apple won't send it again).
  if (fullName && data.user && !data.user.user_metadata?.full_name) {
    await supabase.auth.updateUser({ data: { full_name: fullName } });
    await supabase.from('profiles').update({ display_name: fullName }).eq('id', data.user.id);
  }

  return data;
}
