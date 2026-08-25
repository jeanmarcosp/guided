// Guided — delete account
//
// Runs with the service-role key (never shipped to the client) to delete the
// caller's own auth user. Deployed with verify_jwt = true, so only an
// authenticated request reaches here — but that only proves *someone* is
// signed in, not *which* account to delete, so we still resolve the caller's
// id from their own token server-side and never trust an id in the body.
//
// Deleting the auth user cascades through every foreign key that points at
// profiles(id) — guides you own (and their layers/places), guide_shares rows
// (both as owner and as a shared-with member), and place_visits. See
// supabase/migrations/0001_init_schema.sql and 0012_place_visits.sql. The one
// thing NOT covered by a SQL foreign key is the avatar file in Storage, so
// that's removed explicitly (best-effort) before the user is deleted.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing_authorization' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Identify the caller from their own token — this is the only source of
  // truth for which account gets deleted.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await asCaller.auth.getUser();
  if (userError || !userData.user) return json({ error: 'not_authenticated' }, 401);
  const userId = userData.user.id;

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Best-effort: not linked by a DB foreign key, so it'd survive the cascade
  // below untouched otherwise. A missing file is fine.
  const { error: storageError } = await admin.storage
    .from('avatars')
    .remove([`${userId}/avatar`]);
  if (storageError) console.warn('[delete-account] avatar cleanup failed:', storageError.message);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) return json({ error: deleteError.message }, 500);

  return json({ ok: true });
});
