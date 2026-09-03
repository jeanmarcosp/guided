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

Sign-in uses a **8-digit email code** (`signInWithOtp` + `verifyOtp`), which
needs custom SMTP (the built-in email service is rate-limited to a couple/hour
and can't edit templates). Configure **Custom SMTP** under
**Authentication → Emails → SMTP Settings**.

**Production** sends through [Resend](https://resend.com) on a domain we
control (`guidedmaps.com`), verified there (SPF/DKIM/DMARC DNS records added
at the registrar):

- Host `smtp.resend.com`, port `465` (SSL) or `587` (TLS), username `resend`,
  password = a Resend API key.
- Sender email on the verified domain (e.g. `noreply@guidedmaps.com`).

For **personal/dev testing only**, Gmail SMTP with an App Password also
works — just don't rely on it for anything beyond your own testing (rate
limits, deliverability, and it's outside Gmail's intended use).

Then, either way:

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

## Phase 2 — collaborative editing (editors + realtime)

Phase 2 is in the code: a user who accepts an **editor** share link can add/edit/
delete places and layers, and all collaborators see changes **live** via Supabase
Realtime. It's additive — no schema rewrite. To turn it on:

1. **Apply the new migrations** (`0009`, `0010`, `0011`):
   ```bash
   supabase db push
   ```
   `0009` adds the `can_edit_guide()` helper and editor write policies on `places`
   / `layers` (guides + sharing stay owner-only). `0010` publishes guides/layers/
   places for Realtime. `0011` sets `REPLICA IDENTITY FULL` (so deletes and revokes
   propagate under RLS) and publishes `guide_shares` (so viewer↔editor role changes
   reach the affected member live). Re-run `supabase db push` whenever you pull new
   migrations — already-applied files are skipped.
2. **Confirm Realtime is on** for the project (Supabase **Database → Replication**,
   or **Realtime** settings). Publishing the tables is the DB-side switch; the
   project-level Realtime feature is enabled by default.

**Troubleshooting — a promoted editor still sees no Add button:** their device is
holding a stale `viewer` role. Make sure `0011` is applied (it publishes
`guide_shares`, the channel that delivers role changes) and that the member was
promoted from the **member list** on the Share screen (tap their role → Can edit),
not by toggling the create-link segment (that only sets the role of _new_ links).
Backgrounding and reopening the app also reconciles the role via the foreground
refresh.

Verify (needs two accounts on dev builds):

- Open a guide → Share → toggle **Editor** → send the link. The second account opens
  `guided://share/<token>` → the guide appears under **Shared with me** with **Add**
  and **Layers** available and **no Share button** (editors can't re-share).
- Editor adds/edits/removes a place or layer → it appears on the owner's device
  **without reopening** (realtime), and vice-versa.
- Guide cards show a cluster of avatars for the other people with access
  (everyone but you) — on both shared-with-me and owned-and-shared guides.
- A **Viewer** link stays fully read-only (no Add / Layers / swipe-delete).
- On the Share screen, tap a member's role to switch them between **Can view** and
  **Can edit** (or remove them). The change reaches that person live — a promoted
  viewer gets Add/Layers without reopening; a demoted editor loses them.

## Personal "visited" marks

Users can mark places they've **been to**. This is per-user **private** state —
each person marks (and sees) only their own visits; collaborators never see each
other's. It's stored server-side so it syncs across a user's devices.

1. **Apply the migration** (`0012`):
   ```bash
   supabase db push
   ```
   `0012` adds `place_visits (user_id, place_id, visited_at)` with RLS that scopes
   every row to `user_id = auth.uid()` — a user can only ever read/create/delete
   their own marks. Rows cascade-delete when the place (or user) is removed. No
   Realtime publication is needed: marks re-pull on sign-in and on app foreground.

Verify (single account is enough):

- Open a guide → long-press a place → **Visited**. The row dims with a green check
  and the sheet subtitle shows "… · N visited". Long-press → **Visited** again to
  clear it.
- The mark survives a reload and appears on a second device after foregrounding.
- A **viewer** on a shared guide can still mark places visited (it's personal),
  even though they can't edit the guide.

## Profile avatars (image or color)

Users can set a profile picture or pick a background color for their initial
avatar. Avatars show in the member cluster on guide cards, the guide-settings
member list, and the share screen — so collaborators see each other's.

1. **Apply the migrations** (`0013`, `0014`):
   ```bash
   supabase db push
   ```
   `0013` adds `profiles.avatar_color` and creates a **public-read** storage
   bucket `avatars`. Storage policies confine writes to each user's own folder
   (object name `{user_id}/avatar`), while reads are public so any collaborator
   can load an avatar by URL. `0014` publishes `profiles` for Realtime so a
   collaborator's avatar/name change reaches other members' clusters **live**
   (RLS still gates delivery to people who share a guide). Re-run `supabase db
push` after pulling — applied migrations are skipped by filename.
2. Nothing else to configure — the bucket and its policies are created by the
   migration (no dashboard clicks). The app already requests photo-library
   permission via the `expo-image-picker` config plugin (`app.json`).

Verify (single account, on a **dev build** — the image picker is a native module):

- **Settings → AVATAR → Choose Photo** → pick an image, then pinch/pan it inside
  the **circular** cropper and tap **Use Photo**. The profile avatar updates
  immediately; tap it again (or **Change Photo**) to replace it, **Remove** to
  clear it. (Circular crop needs `expo-image-manipulator` — a native module, so
  rebuild the dev build after pulling.)
- **Or pick a color** → the initial avatar takes that color; the selected swatch
  shows a check. Picking a color clears an uploaded photo (an avatar is one or
  the other).
- Share the guide with a second account → each sees the other's avatar in the
  member cluster / people list. Changing one account's avatar updates the other's
  cluster **live** (via `0014`'s profiles Realtime). Note the home cluster shows
  _other_ members, never yourself — so a single account won't see its own change
  there. New members joining still appear on the next app foreground.

## Account deletion

Required by Apple (App Store Review Guideline 5.1.1(v)): any app that supports
creating an account must also let people delete it, in-app. Deleting the
`auth.users` row cascades through every foreign key that points at
`profiles(id)` — owned guides (and their layers/places), `guide_shares` rows
(as owner and as a member), and `place_visits` — so no new migration is needed;
the avatar file in Storage isn't covered by a foreign key and is removed
explicitly by the function.

Deleting an auth user needs the **service-role key**, which never ships to the
client, so it runs as an edge function:

```bash
supabase functions deploy delete-account
```

Nothing else to configure — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` are provided to every edge function automatically.

Verify (use a throwaway account — this is irreversible):

- **Settings → Delete Account** → confirm. You're returned to sign-in, and the
  account (plus any guides it owned) is gone — check the `auth.users` and
  `guides` tables in Supabase Studio.
- Share one of that account's guides with a second account first, then delete
  the first account → the guide disappears for the second account too (guides
  cascade-delete with their owner). A guide _shared with_ the deleted account
  (owned by someone else) is unaffected — it just drops off the deleted
  account's list.
