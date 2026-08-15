# Guided — Backend Setup (Auth + Sharing)

This app now has accounts, a Supabase backend, and share-link collaboration. The
code is committed; these are the one-time external steps only you can do. Once
done, sharing works end-to-end.

> Apple Sign In and deep links do **not** work in Expo Go. You need a **dev
> build** (`npx expo run:ios` or an EAS dev client).

## 1. Create the Supabase project

1. Create a project at https://supabase.com (note the **Project URL** and
   **anon public** key from _Project Settings → API_).
2. Copy `.env.example` → `.env.local` and fill in:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
   ```
3. Restart the bundler so the env vars are picked up.

## 2. Apply the database schema

Install the Supabase CLI (`brew install supabase/tap/supabase`), then:

```bash
supabase link --project-ref <ref>
supabase db push          # applies supabase/migrations/*.sql
```

This creates the `profiles / guides / layers / places / guide_shares` tables,
the signup + `updated_at` triggers, the coordinate dedupe index, all Row Level
Security policies, and the `accept_share_token` RPC.

## 3. Auth: email code (Apple Sign In deferred)

Sign-in uses a **6-digit email code** (`signInWithOtp` + `verifyOtp`), which
needs custom SMTP (the built-in email service is rate-limited to a couple/hour
and can't edit templates). Configure **Custom SMTP** under
**Authentication → Emails → SMTP Settings** (Gmail SMTP with an App Password
works for personal testing), then:

- **Authentication → Emails → Magic Link template:** render the code with
  `{{ .Token }}` (this is the template `signInWithOtp` uses).
- **Authentication → Providers → Email:** turn **off "Confirm email"** so new and
  returning users both use the `email` OTP path (or add `{{ .Token }}` to the
  "Confirm signup" template too).

Share links still use deep links, so in **Authentication → URL Configuration**
set Site URL `guided://` and add redirect URLs `guided://callback`,
`guided://share/*`, `guided://**`.

**Sign in with Apple is deferred** (it needs a paid Apple Developer account and
its entitlement blocks free-account dev builds). It's turned off via
`APPLE_SIGN_IN_ENABLED = false` in `lib/config.ts`. To enable later:

1. Set `APPLE_SIGN_IN_ENABLED = true`.
2. In `app.json`, add `"expo-apple-authentication"` to `plugins` and
   `"usesAppleSignIn": true` under `ios`.
3. In the Apple Developer portal, enable _Sign In with Apple_ for
   `com.anonymous.guided`, create a Services ID + key (.p8).
4. In **Supabase → Authentication → Providers → Apple**, paste the Services ID
   and generated secret, then rebuild the dev client.

## 4. Deploy the Foursquare proxy (optional but recommended)

Moves the Foursquare key off the client. Without it, place search still works via
Apple/OpenStreetMap.

```bash
supabase secrets set FOURSQUARE_API_KEY=<your-foursquare-key>
supabase functions deploy foursquare-search
```

## 5. Build & run

```bash
npx expo run:ios          # dev build with Apple Sign In + deep links
```

## Verify it works

- **Sign in**: launch → Apple button and email link both reach the guides list.
  Kill and relaunch → still signed in (session persists in the Keychain).
- **Migration**: any guides you had before signing in appear in the cloud once
  (check the `guides` table in Supabase Studio).
- **Sharing**: open a guide → Share → send the link. On a second device/account,
  open the `guided://share/<token>` link → the guide shows up under **Shared with
  me**, read-only (no Add / swipe-delete).
- **Sign out** (⚙ button on the guides screen) clears local data; signing back in
  re-hydrates from the cloud.

## What's next (Phase 2 — collaborative editing)

Schema already supports it (`role`, `added_by`, dedupe index). Phase 2 adds
editor-role RLS on `places`, Supabase Realtime subscriptions, and enables the Add
button for editors — no schema rewrite needed.
