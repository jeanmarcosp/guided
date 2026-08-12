# Guided

Build personal map guides — curated collections of places, organized into layers, pinned on a map. Search for a spot, drop it into a guide, and it's automatically routed into a matching layer (food, coffee, shopping, and so on). Everything is stored on-device, so your guides work offline and stay private.

Built with [Expo](https://expo.dev) (SDK 54) and React Native for iOS.

## Features

- **Guides** — create, rename, color, emoji, pin, reorder, and swipe-to-delete collections of places.
- **Layers** — places auto-sort into category layers you can rename, recolor, hide, collapse, and reorder.
- **Map + list** — see every pin on a map or scan them as a list, filtered by layer.
- **Place search with graceful fallback** — three providers, tried in order:
  1. **Apple MKLocalSearch** — native, same data as Apple Maps (requires a local dev build).
  2. **Foursquare Places** — used when `EXPO_PUBLIC_FOURSQUARE_API_KEY` is set.
  3. **Photon / OpenStreetMap** — keyless, always-available fallback.
- **Local-first** — guides persist to device storage (AsyncStorage via Zustand); no account, no backend.
- **Light / dark / system** appearance.

## Requirements

- [Node.js](https://nodejs.org) 18+
- Xcode (for the iOS dev build that enables native Apple search)
- An iOS device or simulator

> **Note on Expo Go:** This app includes a custom native module (`modules/apple-search`), so Apple search only works in a **local dev build**, not in Expo Go. In Expo Go it falls back to Foursquare or OpenStreetMap.

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. (Optional) add a Foursquare key for better search without a native build
cp .env.example .env.local
#   then paste your key into .env.local

# 3. Run
npm run ios      # build & run the native iOS dev build (recommended)
# or
npm start        # start the Metro dev server (Expo Go / web)
```

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `EXPO_PUBLIC_FOURSQUARE_API_KEY` | No | Enables Foursquare place search. Get a free key at [foursquare.com/developers](https://foursquare.com/developers). Without it, search falls back to OpenStreetMap. |

Copy `.env.example` to `.env.local` and fill it in. `.env.local` is git-ignored and never committed. Restart the dev server after editing (`npx expo start -c`).

## Project structure

```
app/                 Expo Router screens
  index.tsx            Guides home (list, reorder, create/edit)
  guide/[id]/          A single guide: map, layers, search
components/           Reusable UI (GuideCard, GuideMap, PlaceRow, …)
lib/                  Search, Foursquare, layers, maps, types
modules/apple-search/ Custom native iOS module (MKLocalSearch)
store/               Zustand stores (guides, settings) with persistence
theme/               Design tokens (colors, spacing, typography)
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run ios` | Build and run the native iOS dev build |
| `npm run android` | Build and run on Android |
| `npm run web` | Run in the browser |

## License

See [LICENSE](./LICENSE).
