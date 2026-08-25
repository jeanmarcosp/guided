# App Store Connect — App Privacy answers

**Reference for filling out App Store Connect's "App Privacy" questionnaire.**
Not a legal document, not user-facing — a worksheet so that screen is
fill-in-the-blank instead of a judgment call under time pressure. Grounded in
what's actually in the code and the Supabase schema as of this writing;
re-check it if data collection changes. Cross-check against
[PRIVACY_POLICY.md](./PRIVACY_POLICY.md), which should always say the same
thing in user-facing language.

We don't use any advertising, analytics, or crash-reporting SDK (checked
`package.json` — nothing there), so **nothing in this app is used for
tracking** (Apple's specific "used to track you across apps/websites"
definition) and there's no third-party SDK to declare separately.

For each data type: does the app collect it, is it linked to the person's
identity, and what's it used for (in Apple's fixed purpose list — App
Functionality is the one that applies almost everywhere here, since nothing
is used for advertising, analytics, or personalization beyond the app's own
core features).

| Data type                                                | Collected?    | Linked to identity? | Purpose           | Why                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------- | ------------- | ------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contact Info** — Email Address                         | Yes           | Yes                 | App Functionality | Sign-in (`signInWithOtp`) and account identity (`profiles.email`).                                                                                                                                                                                                                                                                                                                                                     |
| **Location** — Precise Location                          | Yes           | **No**              | App Functionality | Centers the map and scopes place search. Never written to our database — used on-device and passed through per-request to the search provider. Optional (only if location permission is granted).                                                                                                                                                                                                                      |
| **User Content** — Photos or Videos                      | Yes           | Yes                 | App Functionality | Optional profile avatar (`profiles.avatar_url`, `storage.avatars`).                                                                                                                                                                                                                                                                                                                                                    |
| **User Content** — Other User Content                    | Yes           | Yes                 | App Functionality | Guides, layers, and places the person creates (`guides`, `layers`, `places` tables) — the core product.                                                                                                                                                                                                                                                                                                                |
| **Identifiers** — User ID                                | Yes           | Yes                 | App Functionality | The Supabase auth/profile id, used for account and sharing.                                                                                                                                                                                                                                                                                                                                                            |
| **Contacts**                                             | No            | —                   | —                 | Never accessed.                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Search History**                                       | Judgment call | —                   | —                 | Search query text passes through our Foursquare proxy edge function per-request but is **not logged or stored** by us. Whether a pass-through, non-persisted value needs declaring is genuinely a judgment call — Apple's guidance leans toward declaring anything your servers _see_, even transiently. Recommend declaring it as collected, not linked to identity, App Functionality only — safer than omitting it. |
| **Browsing History**                                     | No            | —                   | —                 | N/A — not a browser.                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Usage Data**                                           | No            | —                   | —                 | No analytics SDK.                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Diagnostics**                                          | No            | —                   | —                 | No crash-reporting SDK.                                                                                                                                                                                                                                                                                                                                                                                                |
| **Financial Info / Health / Sensitive Info / Purchases** | No            | —                   | —                 | Not collected. No IAP, no payments.                                                                                                                                                                                                                                                                                                                                                                                    |

## Third parties whose privacy practices apply to a slice of this data

Not "sharing" in the sense App Store Connect asks about (we don't sell or
hand off your data to advertisers), but worth listing so you can decide how
much detail to put in the policy text field:

- **Supabase** — hosts the database, auth, storage, and edge functions. Sees
  everything in the table above, as our infrastructure processor.
- **Apple (MKLocalSearch)**, **Foursquare**, **OpenStreetMap/Photon** — each
  sees the text of a place search when they're the provider answering it (only
  one per search, in that priority order). No account identity is attached by
  us.

## Before you fill out the actual form

- [ ] Re-confirm nothing changed here since this doc was written (new
      dependency, new column, a new third-party service).
- [ ] Decide the Search History judgment call above and note your decision.
- [ ] Answer App Store Connect's data-linked-to-tracking questions as **No**
      across the board — nothing here is used to track a person across other
      companies' apps or websites.
