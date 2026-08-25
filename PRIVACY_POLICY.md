# Guided Privacy Policy

**DRAFT — for your review.** This is written from what the app actually
does today, based on the code and the Supabase schema, not a template.
Read it, adjust anything that doesn't match your intent, and get an
actual legal review before you rely on it for App Store submission. It
also isn't hosted anywhere yet — App Store Connect needs a URL, so this
needs to live on a real page (even a plain one) before you submit.

_Last updated: [fill in when you publish this]_

## What this covers

This policy covers the Guided iOS app and its backend. Guided is built
with Expo/React Native and uses Supabase to store accounts, guides, and
sharing data.

## Information we collect

**Account information.** When you sign in, we collect your email
address. Sign-in uses a one-time 6-digit code sent to that address — we
don't store a password. If you haven't set a display name, your email
address is what collaborators on a shared guide see in the member list
instead.

**Profile information.** You can optionally set a display name and
either a profile photo or a chosen color for your avatar. This is shown
to people you share a guide with, or who share a guide with you.
Profile photos are stored in a bucket that's readable by anyone with
the file's URL — not restricted to just your collaborators.

**Location.** If you grant location permission, we use your device's
location, only while the app is in use, to center the map on your
current area and to find nearby places when you search. Location isn't
stored on our servers — it's used on-device and, for search, sent along
with your search request to whichever place-search provider handles it
(see below).

**Your guides and places.** The guides, layers, and places you create —
names, categories, coordinates, and notes — are stored on our servers
(via Supabase) so they sync across your devices and so sharing works.
If you share a guide, the people you share it with can see (and, if you
grant edit access, change) that guide's content.

**"Visited" marks.** Marking a place as visited is private — only you
can see your own marks, even on a guide you don't own or that's shared
with others. It's stored server-side so it follows you across devices.

**Sharing and collaboration data.** When you share a guide, we store
who it's shared with and what role they have (can view / can edit), so
access and permissions work correctly.

**Place search queries.** When you search for a place, the text you
type is sent to whichever provider is answering that search: Apple's
on-device search (native builds only), Foursquare (if configured), or
OpenStreetMap/Photon (the no-key fallback). That query is subject to
each provider's own privacy practices, which we don't control. We don't
attach your account identity to these queries ourselves.

## Who we share information with

We don't sell your information, and we don't use advertising or
analytics SDKs. Your information is shared only:

- **With people you explicitly share a guide with** — the parts of your
  content and profile described above.
- **With our infrastructure providers** — currently Supabase, which
  hosts our database, authentication, file storage, and edge functions.
  They process data on our behalf, not their own.
- **With place-search providers** — Apple, Foursquare, and/or
  OpenStreetMap, as described above, limited to the text of your search.

## Your choices

- You can sign out at any time from Settings; this clears the app's
  local data on that device (your account and cloud data are
  unaffected).
- You can remove your profile photo or change your avatar color at any
  time.
- You can delete a guide you own, which removes it and its places for
  everyone it was shared with.
- You can revoke someone's access to a guide you own at any time from
  that guide's Share screen.
- You can permanently delete your account from Settings → Delete
  Account. This deletes your account, every guide you own (including
  for anyone you've shared it with), your visited marks, and your
  avatar photo. It cannot be undone. Guides others have shared with
  you are simply removed from your view — deleting your account
  doesn't affect their guide or their other collaborators.

## Data retention

We keep your account and guides until you delete them, or until you
delete your account. If you delete a guide, its places and layers are
deleted with it. If you revoke someone's access to a shared guide,
they lose access to that guide's content going forward. Deleting your
account removes your data as described above immediately; it isn't
held in a recoverable state afterward.

## Children's privacy

Guided isn't directed at children, and we don't knowingly collect
information from anyone under 13.

## Changes to this policy

If this policy changes in a way that matters, we'll update the date at
the top. [Add how you'll notify existing users, if at all — e.g. an
in-app notice — once you decide.]

## Contact

[Add a real contact email or support URL here before publishing.]
