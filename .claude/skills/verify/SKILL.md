# Verify: run & drive the Guided app (iOS simulator)

Recipe for exercising changes in the real app. Expo dev-client + Metro; no Expo Go.

## Launch

- Metro usually already runs on port 8081 (check `lsof -iTCP:8081 -sTCP:LISTEN`; its cwd should be this repo). If not: `npm start`.
- Dev client is installed on the booted simulators as `com.anonymous.guided`. Find booted devices: `xcrun simctl list devices booted`. Multiple sims may be booted — pick one UDID and use it consistently (`pgrep Guided` matches ALL sims' processes; get the right pid via `xcrun simctl spawn <udid> launchctl list | grep guided`).
- Launch: `xcrun simctl terminate <udid> com.anonymous.guided; xcrun simctl launch <udid> com.anonymous.guided` then wait ~10s for the JS bundle.
- Navigate via deep link (expo-router, scheme `guided`): `xcrun simctl openurl <udid> "guided://guide/<guideId>"`. iOS sometimes shows an "Open in Guided?" confirm dialog — tap Open via idb (below).
- Guide ids / place data live in AsyncStorage:
  `$(xcrun simctl get_app_container <udid> com.anonymous.guided data)/Library/Application Support/com.anonymous.guided/RCTAsyncLocalStorage_V1/` — key `guide-maker-storage-v1`; large values are in files named md5(key). Read-only inspection is fine; don't mutate (guides sync to Supabase).

## Drive (taps/swipes)

- macOS accessibility (osascript/cliclick) is NOT granted. Use **idb** (HID events, no permissions):
  - `brew tap facebook/fb && brew trust facebook/fb && brew install idb-companion`
  - `python3 -m venv <scratch>/idbenv && <scratch>/idbenv/bin/pip install fb-idb`
  - fb-idb is broken on Python ≥3.12: patch `site-packages/idb/cli/main.py` replacing `loop = asyncio.get_event_loop()` with `new_event_loop()` + `set_event_loop`.
  - `idb ui tap --udid <udid> X Y` / `idb ui swipe --udid <udid> x1 y1 x2 y2 --duration 0.4` — coords in **logical points** (iPhone 17 Pro Max: 440×956; screenshots are 3x, so divide px by 3). No pinch support — zoom out via the fit-all button, zoom in via cluster taps / fitToCoordinates paths.
- Screenshot: `xcrun simctl io <udid> screenshot out.png`.
- Map screen buttons (guide detail): locate + fit-all buttons float ABOVE the bottom sheet — their Y depends on sheet snap (sheet snaps: 120pt peek / 45% / 90%). At peek, fit-all ≈ (400, 799); at 45% ≈ (401, 491).

## Gotchas

- Crash reports land in `~/Library/Logs/DiagnosticReports/Guided-*.ips` (JSON; first line meta, rest body).
- lldb attach works on the dev build (breakpoints in Guided.debug.dylib symbols). NEVER SIGKILL lldb while breakpoints are set — orphaned `brk` patches SIGTRAP-crash the app and can wedge the simulator (fix: `xcrun simctl shutdown <udid> && boot`, app data survives).
- JS console.log does NOT reach os_log; Metro's stdout runs in the user's terminal. Prefer screenshots + lldb for runtime evidence.
- react-native-maps mutation rules: see comments in `components/GuideMap.tsx` (fixed marker pool; never add/remove map children on zoom; never use Marker `opacity`).
