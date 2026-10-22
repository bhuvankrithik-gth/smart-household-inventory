# TEST RESULTS — actual runs in this VM (Node v24.20.0, npm 10.9.4, 96 GB free disk)

Environment inspected first: `node -v` v24.20.0 · `java` **not found** · no Android SDK (`/opt/android*` absent) → local APK build impossible here; EAS cloud build is the APK path (README).

## Commands & results
| # | Command | Result |
|---|---------|--------|
| 1 | `npm install` (+ `npx expo install …`) | ✅ Completed. Expo SDK **58.0.17**, React 19.3, RN 0.88. One initial failure: `@hookform/resolvers@6` peer-conflict → dropped that package (forms validate with Zod directly). firebase ^13.1.0, @tanstack/react-query, react-hook-form, zod, jest 30, jest-expo 58 installed. |
| 2 | `npx tsc --noEmit` | ✅ **PASS — zero errors** (after fixing: jest globals import, `pricePerUnit` return type, receipt input typing, removing unused template files). |
| 3 | `npx jest` | ✅ **20/20 tests passed, 1 suite** — units/conversion, price-per-unit, low-stock, expiry statuses, run-out prediction (3 kg rice @ ~1 kg/day ≈ 3 days + insufficient-data case), replenishment reason, duplicate detection, **idempotent stock engine (duplicate purchase op applies exactly once; negative stock throws)**, shopping/budget/waste totals, assistant (unknown item is never invented; proposed-action parsing), recipe scoring, and the full §19 end-to-end scenario (add → consume → low-stock → purchase exactly once). |
| 4 | `npx expo-doctor` | ✅ **20/20 checks passed** (after merging app.json into app.config.js and `npm install -D eslint-config-expo`; `npx expo install --check` → "Dependencies are up to date"). |
| 5 | `npx expo lint` | ✅ Clean (after fixing: `expo-file-system/legacy` import for SDK 58, unescaped entity, unused imports). |
| 6 | `npx expo export --platform web` | ✅ **Exported: dist** — all 24 route bundles built (tabs, login/register/reset, item detail/edit/scan/receipt, household, recipes, waste, assistant, settings, terms, privacy, licences). Layout is a centred max-width (860px) responsive column, so the same export serves ~360px phone widths and laptop widths; no emulator exists here, so visual multi-width verification is by responsive design + successful web export, **not** device screenshots. |
| 7 | **Standalone check — localhost grep** | Source: `grep -rn "localhost\|127.0.0.1" src/ app.config.js eas.json` → **NO matches**. Exported bundle: **no `127.0.0.1` anywhere**; the string `localhost` appears only inside the bundled **expo-linking library's URL parser** (`{hostname:'localhost', …scheme:'http'}` fallback default) — library internals, not an app endpoint. The app contains no dev-server/local endpoint in any code path, and Firebase config is baked in at build time: the bundle contains the project id `smart-household-inventory` (found in the exported login/entry bundles). |
| 8 | APK build | ⚠️ **Not produced in this VM** — no Java/Android SDK and EAS CLI login is the user's credential step. `eas.json` is configured (production + preview = APK, production-aab = AAB). Blocker + exact steps in README/KNOWN_LIMITATIONS. No EAS project exists yet; `eas init` creates it under owner `bhuvankrithiks-team`. |
| 9 | Live Firebase / Firestore | ⚠️ Not tested live — rules are not yet published on the project (production deny-all). App handles permission-denied gracefully (`probeCloud`). Local mode is the verified mode. |

## v1.1.0 — demo removal, auth gate, account isolation, dark theme, OTA (2026-10-23)

Changes: sample/demo dataset deleted (`src/lib/seed.ts` gone, store boots to an empty DB, store key bumped to `shi-db-v4` so old sample data is not carried over); first open now lands on sign-in/register; per-account household isolation fixed + regression-tested (`householdIdForUser` in `src/lib/logic.ts`); forced dark theme everywhere (`userInterfaceStyle: 'dark'`, dark tab bar/header with Ionicons tab icons); `expo-updates` + `@expo/vector-icons` installed via `npx expo install`; `updates.url` = `https://u.expo.dev/3e80728c-59e8-42ea-b2ff-596dd3b2b0dd`, `runtimeVersion` policy `appVersion`, production channel in `eas.json` — OTA updates are enabled from the v1.1.0 build onward (the v1.1.0 APK itself still needs one manual install).

| # | Command | Result |
|---|---------|--------|
| 1 | `grep -ri demo src/` | ✅ **ZERO hits** (also scrubbed from README.md, docs/USER_GUIDE.md, docs/DT_REPORT_OUTLINE.md; exported web bundle contains no `demo@local`). |
| 2 | `npx tsc --noEmit` | ✅ **PASS — zero errors.** |
| 3 | `npx jest` | ✅ **23/23 tests passed, 1 suite** — the original 20 plus 3 new `account data isolation` regression tests (each user resolves only their own household; disjoint households never cross over; a user with no membership resolves `undefined`, never another account's household). |
| 4 | `npx expo lint` | ✅ Clean. |
| 5 | `npx expo export --platform web` | ✅ **Exported: dist** — all route bundles built with the new dark UI and tab icons. |
| 6 | `npx expo config --json` | ✅ version `1.1.0`, `userInterfaceStyle: 'dark'`, `updates.url` set to the EAS project URL, `runtimeVersion: { policy: 'appVersion' }`. |
