/**
 * guide-preview — serves Guided share links over HTTPS so they unfurl with a
 * rich preview card in iMessage / WhatsApp / Slack / X, like a TikTok or tweet.
 *
 * Routes:
 *   GET /share/:token          OG/Twitter meta tags + "Open in Guided" landing page
 *   GET /share/:token/og.png   dynamically rendered 1200x630 social card
 *   GET /.well-known/apple-app-site-association   (only when APPLE_TEAM_ID is set)
 *
 * Guide metadata comes from the anon-callable `share_link_preview` RPC
 * (supabase/migrations/0017) — scrapers hold no auth, so the token itself is
 * the credential, same as in the app.
 */
import { ImageResponse, loadGoogleFont } from 'workers-og';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  APP_SCHEME: string;
  APPLE_TEAM_ID?: string;
  /** MapKit JS credentials for Apple Maps Web Snapshots (og image map). */
  APPLE_MAPKIT_TEAM_ID?: string;
  APPLE_MAPKIT_KEY_ID?: string;
  /** Contents of the MapKit JS .p8 key — set with `wrangler secret put APPLE_MAPKIT_KEY`. */
  APPLE_MAPKIT_KEY?: string;
  /** Override for tests only; defaults to Apple's snapshot host. */
  SNAPSHOT_BASE_URL?: string;
  /**
   * Numeric App Store ID (from the App Store Connect app record). Enables the
   * Safari Smart App Banner and the App Store fallback when the app isn't
   * installed. Until set, the landing page shows a "coming soon" note instead.
   */
  APP_STORE_ID?: string;
}

type Preview = {
  name: string;
  emoji: string;
  color: string;
  placeCount: number;
  placeNames: string[];
  places: { lat: number; lng: number }[];
  ownerName: string;
  role: 'viewer' | 'editor';
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BRAND_BG = '#132A13';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (
      url.pathname === '/.well-known/apple-app-site-association' ||
      url.pathname === '/apple-app-site-association'
    ) {
      return aasa(env);
    }

    if (parts[0] === 'share' && parts[1]) {
      const token = parts[1].toLowerCase();
      if (!UUID_RE.test(token)) return notFoundPage(env);
      const preview = await fetchPreview(env, token);

      if (parts[2] === 'og.png') {
        if (!preview) return new Response('Not found', { status: 404 });
        return ogImage(preview, env);
      }
      if (parts.length === 2) {
        return preview ? sharePage(preview, token, url, env) : notFoundPage(env);
      }
    }

    if (parts.length === 0) return homePage();
    return notFoundPage(env);
  },
} satisfies ExportedHandler<Env>;

async function fetchPreview(env: Env, token: string): Promise<Preview | null> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/share_link_preview`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Preview | null;
    if (!data || typeof data.name !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Share landing page (meta tags are what scrapers read; the body is for humans)
// ---------------------------------------------------------------------------

function sharePage(p: Preview, token: string, url: URL, env: Env): Response {
  const canonical = `${url.origin}/share/${token}`;
  const title = `${p.emoji} ${p.name}`.trim();
  const description = describe(p);
  const deepLink = `${env.APP_SCHEME}://share/${token}`;
  const storeUrl = env.APP_STORE_ID ? `https://apps.apple.com/app/id${env.APP_STORE_ID}` : null;
  const color = safeColor(p.color);

  // Safari's native open-or-get banner: shows OPEN (app installed, passes the
  // share URL through) or GET (App Store). Only renderable once the app has an
  // App Store Connect record.
  const smartBanner = env.APP_STORE_ID
    ? `<meta name="apple-itunes-app" content="app-id=${env.APP_STORE_ID}, app-argument=${canonical}" />\n`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — Guided</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Guided" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${canonical}/og.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${canonical}/og.png" />
<meta name="theme-color" content="${color}" />
${smartBanner}<style>
  :root { color-scheme: dark; }
  * { margin: 0; box-sizing: border-box; }
  body {
    min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    background: ${BRAND_BG}; color: #fff; padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
    text-align: center;
  }
  .card { max-width: 420px; width: 100%; }
  .emoji {
    width: 96px; height: 96px; margin: 0 auto 20px; border-radius: 28px;
    background: ${color}; display: flex; align-items: center; justify-content: center;
    font-size: 52px; box-shadow: 0 12px 40px rgba(0,0,0,.35);
  }
  h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.3px; margin-bottom: 8px; }
  .sub { font-size: 16px; color: rgba(255,255,255,.65); line-height: 1.45; margin-bottom: 28px; }
  .open {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; height: 52px; border-radius: 14px; background: #fff; color: ${BRAND_BG};
    font-size: 17px; font-weight: 600; text-decoration: none;
  }
  .hint { margin-top: 16px; font-size: 13px; color: rgba(255,255,255,.4); }
  .brand { margin-top: 48px; font-size: 14px; font-weight: 600; color: rgba(255,255,255,.5); }
</style>
</head>
<body>
  <main class="card">
    <div class="emoji">${esc(p.emoji)}</div>
    <h1>${esc(p.name)}</h1>
    <p class="sub">${esc(description)}</p>
    <a class="open" id="open" href="${deepLink}">Open in Guided</a>
    <p class="hint" id="hint">${
      storeUrl
        ? 'Don’t have the app? You’ll be taken to the App Store.'
        : 'You’ll need the Guided app on your iPhone to open this guide.'
    }</p>
    <p class="brand">🧭 Guided</p>
  </main>
<script>
  // Try the app first; if this page is still visible shortly after, the app
  // isn't installed — fall back to the App Store (or explain, pre-launch).
  (function () {
    var deepLink = ${JSON.stringify(deepLink)};
    var storeUrl = ${JSON.stringify(storeUrl)};
    document.getElementById('open').addEventListener('click', function (e) {
      e.preventDefault();
      var timer = setTimeout(function () {
        if (document.visibilityState !== 'visible') return;
        if (storeUrl) {
          location.href = storeUrl;
        } else {
          document.getElementById('hint').textContent =
            'Guided doesn’t seem to be installed on this device — it’s coming to the App Store soon.';
        }
      }, 1800);
      addEventListener('pagehide', function () { clearTimeout(timer); }, { once: true });
      location.href = deepLink;
    });
  })();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

function describe(p: Preview): string {
  const count = `${p.placeCount} ${p.placeCount === 1 ? 'place' : 'places'}`;
  const names = (p.placeNames ?? []).filter(Boolean);
  const sample =
    names.length > 0
      ? ` including ${names.slice(0, 2).join(', ')}${p.placeCount > 2 ? ' and more' : ''}`
      : '';
  return `A guide by ${p.ownerName} with ${count}${sample}. Tap to open it in Guided.`;
}

// ---------------------------------------------------------------------------
// OG image — 1200x630 card rendered with satori (workers-og)
// ---------------------------------------------------------------------------

const fontCache = new Map<string, ArrayBuffer>();

async function font(weight: number): Promise<ArrayBuffer> {
  const key = `inter-${weight}`;
  let data = fontCache.get(key);
  if (!data) {
    data = await loadGoogleFont({ family: 'Inter', weight });
    fontCache.set(key, data);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Apple Maps Web Snapshot — a signed static-map URL, fetched and inlined as a
// data URI so satori can composite it. Signature scheme (verified against
// Apple's spec): ES256 (ECDSA P-256 + SHA-256) over the literal string
// "/api/v1/snapshot?<query>", raw r||s signature, base64url without padding —
// exactly what WebCrypto's ECDSA sign produces.
// ---------------------------------------------------------------------------

let mapkitKey: CryptoKey | null = null;

async function importMapkitKey(pem: string): Promise<CryptoKey> {
  if (mapkitKey) return mapkitKey;
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  mapkitKey = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  return mapkitKey;
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/** Fetch a 1200x630 map snapshot framed around the guide's pins (PNG bytes). */
async function mapSnapshot(env: Env, p: Preview): Promise<ArrayBuffer | null> {
  if (!env.APPLE_MAPKIT_TEAM_ID || !env.APPLE_MAPKIT_KEY_ID || !env.APPLE_MAPKIT_KEY) return null;
  const all = (p.places ?? []).filter((pt) => Number.isFinite(pt?.lat) && Number.isFinite(pt?.lng));
  if (all.length === 0) return null;

  try {
    // Frame the map around every place, but draw at most 10 pins — Apple's
    // snapshot API rejects requests with 11+ annotations (400). Pick a
    // spatially spread subset (greedy farthest-point) so no area looks empty.
    const pins = spreadSample(all, 10);
    const lats = all.map((pt) => pt.lat);
    const lngs = all.map((pt) => pt.lng);
    const center = `${(Math.min(...lats) + Math.max(...lats)) / 2},${(Math.min(...lngs) + Math.max(...lngs)) / 2}`;
    // Pad the bounding box so edge pins don't touch the card's edges.
    const spanLat = Math.max((Math.max(...lats) - Math.min(...lats)) * 1.35, 0.015);
    const spanLng = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.35, 0.015);

    // Apple rejects hex colors with a leading '#' here (400), unlike CSS.
    const color = safeColor(p.color).slice(1);
    const markerStyle = all.length <= 6 ? 'balloon' : 'dot';
    const annotations = pins.map((pt) => ({
      point: `${pt.lat},${pt.lng}`,
      color,
      markerStyle,
    }));

    const params = new URLSearchParams({
      center,
      spn: `${spanLat},${spanLng}`,
      size: '600x315',
      scale: '2',
      colorScheme: 'light',
      annotations: JSON.stringify(annotations),
      teamId: env.APPLE_MAPKIT_TEAM_ID,
      keyId: env.APPLE_MAPKIT_KEY_ID,
    });
    const path = `/api/v1/snapshot?${params.toString()}`;

    const key = await importMapkitKey(env.APPLE_MAPKIT_KEY);
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(path),
    );
    const base = env.SNAPSHOT_BASE_URL ?? 'https://snapshot.apple-mapkit.com';
    const res = await fetch(`${base}${path}&signature=${b64url(new Uint8Array(sig))}`);
    if (!res.ok) return null;
    return res.arrayBuffer();
  } catch {
    return null;
  }
}

/** Greedy farthest-point sampling: keep up to `max` points, maximally spread. */
function spreadSample<T extends { lat: number; lng: number }>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const d2 = (a: T, b: T) => (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2;
  const picked = [points[0]];
  const rest = points.slice(1);
  while (picked.length < max && rest.length > 0) {
    let bestIdx = 0;
    let bestDist = -1;
    for (let i = 0; i < rest.length; i++) {
      const nearest = Math.min(...picked.map((q) => d2(rest[i], q)));
      if (nearest > bestDist) {
        bestDist = nearest;
        bestIdx = i;
      }
    }
    picked.push(rest.splice(bestIdx, 1)[0]);
  }
  return picked;
}

async function ogImage(p: Preview, env: Env): Promise<Response> {
  // The snapshot is already 1200x630 (600x315 @2x) — serve it as-is. The
  // guide name/author live in the og:title/og:description next to the card.
  const map = await mapSnapshot(env, p);
  if (map) {
    return new Response(map, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
    });
  }
  return gradientCard(p);
}

async function gradientCard(p: Preview): Promise<Response> {
  const color = safeColor(p.color);
  const text = lightText(color) ? '#ffffff' : '#10200e';
  const dim = lightText(color) ? 'rgba(255,255,255,0.72)' : 'rgba(16,32,14,0.72)';
  const chipBg = lightText(color) ? 'rgba(255,255,255,0.16)' : 'rgba(16,32,14,0.10)';
  const names = (p.placeNames ?? []).filter(Boolean).slice(0, 3);
  const extra = p.placeCount - names.length;

  const chips = names
    .map(
      (n) =>
        `<div style="display:flex;padding:10px 22px;border-radius:999px;background:${chipBg};color:${text};font-size:26px;">${og(truncate(n, 24))}</div>`,
    )
    .concat(
      extra > 0
        ? [
            `<div style="display:flex;padding:10px 22px;border-radius:999px;background:${chipBg};color:${dim};font-size:26px;">+${extra} more</div>`,
          ]
        : [],
    )
    .join('');

  const html = `
  <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:linear-gradient(135deg,${color} 0%,${shade(color, -28)} 100%);padding:72px;font-family:'Inter';">
    <div style="display:flex;font-size:120px;">${p.emoji}</div>
    <div style="display:flex;flex-direction:column;margin-top:36px;flex-grow:1;">
      <div style="display:flex;color:${text};font-size:72px;font-weight:700;letter-spacing:-2px;">${og(truncate(p.name, 28))}</div>
      <div style="display:flex;color:${dim};font-size:32px;margin-top:16px;">${p.placeCount} ${p.placeCount === 1 ? 'place' : 'places'} · by ${og(truncate(p.ownerName, 24))}</div>
      <div style="display:flex;gap:14px;margin-top:28px;flex-wrap:wrap;">${chips}</div>
    </div>
    <div style="display:flex;align-items:center;gap:14px;">
      <div style="display:flex;color:${text};font-size:34px;font-weight:700;">🧭 Guided</div>
    </div>
  </div>`;

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    emoji: 'twemoji',
    fonts: [
      { name: 'Inter', data: await font(700), weight: 700, style: 'normal' },
      { name: 'Inter', data: await font(400), weight: 400, style: 'normal' },
    ],
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

// ---------------------------------------------------------------------------
// Misc pages + helpers
// ---------------------------------------------------------------------------

function homePage(): Response {
  return simplePage('🧭', 'Guided', 'Build and share map guides with friends.', 200);
}

function notFoundPage(_env: Env): Response {
  return simplePage(
    '🔗',
    'This link isn’t active',
    'The guide may have been deleted, or the link was revoked by its owner.',
    404,
  );
}

function simplePage(emoji: string, title: string, sub: string, status: number): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — Guided</title>
<meta name="theme-color" content="${BRAND_BG}" />
<style>
  :root { color-scheme: dark; }
  * { margin: 0; box-sizing: border-box; }
  body {
    min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    background: ${BRAND_BG}; color: #fff; padding: 24px; text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
  }
  .emoji { font-size: 56px; margin-bottom: 16px; }
  h1 { font-size: 26px; font-weight: 700; margin-bottom: 8px; }
  p { font-size: 16px; color: rgba(255,255,255,.65); max-width: 360px; line-height: 1.45; }
</style>
</head>
<body>
  <main>
    <div class="emoji">${esc(emoji)}</div>
    <h1>${esc(title)}</h1>
    <p>${esc(sub)}</p>
  </main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}

function aasa(env: Env): Response {
  if (!env.APPLE_TEAM_ID) return new Response('Not found', { status: 404 });
  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [`${env.APPLE_TEAM_ID}.com.guidedmaps.app`],
          components: [{ '/': '/share/*' }],
        },
      ],
    },
  };
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
}

function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Sanitize user text for the satori (og image) HTML. Satori's HTMLRewriter
 * parser does NOT decode entities — `&amp;` renders literally — so instead of
 * escaping we drop the only characters that could open/close a tag.
 */
function og(s: string): string {
  return s.replaceAll('<', '‹').replaceAll('>', '›');
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function safeColor(c: string): string {
  return /^#[0-9a-f]{6}$/i.test(c ?? '') ? c : BRAND_BG;
}

/** True if the color is dark enough to need light text on top. */
function lightText(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b < 150;
}

/** Lighten (+) or darken (−) a #rrggbb color by `pct` percent. */
function shade(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16);
  const adj = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 + pct / 100))));
  const r = adj((n >> 16) & 0xff);
  const g = adj((n >> 8) & 0xff);
  const b = adj(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
