import { supabase } from '@/lib/supabase';

/**
 * Send a 6-digit one-time code to the email. Codes are more reliable than magic
 * links on mobile (no deep-link round-trip, no link pre-fetching). Requires the
 * email template to render `{{ .Token }}` — see BACKEND_SETUP.md.
 * `shouldCreateUser` lets first-time users sign up.
 */
export async function sendEmailCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/** Verify the 6-digit code and establish a session. */
export async function verifyEmailCode(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw error;
}

/**
 * Pull auth params from a redirect URL, checking BOTH the query string and the
 * `#fragment`. Retained for any link-based flow (e.g. share deep links).
 */
function extractAuthParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const marker of ['?', '#']) {
    const idx = url.indexOf(marker);
    if (idx === -1) continue;
    for (const pair of url.slice(idx + 1).split('&')) {
      const [k, v] = pair.split('=');
      if (k && v) out[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  return out;
}

/** Exchange a magic-link deep link for a session (PKCE `code` or implicit tokens). */
export async function completeMagicLink(url: string): Promise<boolean> {
  const params = extractAuthParams(url);
  if (params.error_description) throw new Error(params.error_description);

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return true;
  }
  if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw error;
    return true;
  }
  return false;
}
