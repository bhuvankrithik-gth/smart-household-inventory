# Smart Household Inventory

**Know what you have. Know what you need. Buy only what makes sense. Waste less.**

A real, installable React Native (Expo, TypeScript) app for Indian households (₹, metric units): shared household inventory with batches & expiry, rule-based run-out predictions, smart shopping (purchase → inventory exactly once), budgets & price history, expiry-aware recipes, waste tracking (SDG 12), and a data-honest assistant. One codebase: Android APK + iOS-compatible + Expo web for laptops.

## Download the Android app
**[⬇ Latest release (APK) — github.com/bhuvankrithik-gth/smart-household-inventory/releases/latest](https://github.com/bhuvankrithik-gth/smart-household-inventory/releases/latest)**

Download the APK from the latest GitHub Release and install it on any Android phone (7.0+): open the file and allow "install from unknown apps" for your browser/files app when Android asks (normal for direct APK installs outside Play Store). Building from source with EAS instead is described below.

## Accounts — cloud, on every device (v2.0)
- **One account, any device:** accounts are real **Firebase Auth** accounts (project **smart-household-inventory**, Spark, asia-south1 Mumbai, Email/Password). Sign up once, then sign in on any phone or laptop and you see the **same households, inventory, lists and history** — data lives in **Cloud Firestore** and syncs live between devices.
- **Sharing:** create a household and share its invite code; family members join with the code and see the same shared inventory. Access is enforced by `firestore.rules` (household membership on the household doc), so households are fully isolated from each other.
- **Required one-time step before cloud works:** publish the rules — Firebase Console → Firestore Database → **Rules** → paste the repo's `firestore.rules` → **Publish** (or `firebase deploy --only firestore:rules` after your own `firebase login`). Until then Firestore is deny-all and sign-in/data calls will fail with permission errors.
- **Offline:** the app keeps a working copy of your data on the device — it opens with your data and queues changes while offline, uploading them when you reconnect (conflicts are last-write-wins; see docs/KNOWN_LIMITATIONS.md).
- **Upgrading from v1.x:** the first cloud sign-in on a device uploads that device's old local households into the new cloud account, once.

## Run it
```bash
npm install
cp .env.example .env   # a working local .env (public Firebase client config) is already in the workspace; .env.example is the template
npx expo start         # scan with Expo Go for a quick look, or press w for web (laptop)
```
Dependency versions: Expo SDK 58 · React 19.3 · React Native 0.88 · firebase ^13 · @tanstack/react-query · react-hook-form · zod · jest 30 / jest-expo 58.

## Standalone APK for ANY Android phone (EAS)
The release APK is a **standalone build**: no Expo Go, no Metro/dev server, no localhost, nothing fetched from any dev machine. Firebase config is baked in at build time.
```bash
npx eas-cli@latest login      # USER STEP: logs in as bhuvan_krithik (owner bhuvankrithiks-team)
npx eas-cli@latest init       # creates/links the EAS project (slug: smart-household-inventory) — no project exists yet
npx eas-cli@latest build --platform android --profile production   # production = installable APK (preview = APK too; production-aab = Play Store bundle)
```
Then download the APK from the EAS build page and install it on any Android phone: open the file and allow "install from unknown apps" for your browser/files app when Android asks (normal for direct APK installs outside Play Store). **Android support:** Expo SDK 58 targets Android 7.0+ — covers essentially all phones in use. Layouts are responsive from ~360px phones to tablets.
**iOS:** same codebase; build with `eas build --platform ios` — requires the user's Apple Developer account / TestFlight for installation on a real iPhone.

## Tests
```bash
npm test          # jest unit + end-to-end scenario tests (src/lib/__tests__)
npx tsc --noEmit  # typecheck
```
See **TEST_RESULTS.md** for the actual runs done during the build.

## Docs
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — layers, Firestore collection map, stock/idempotency design, offline queue.
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) · [docs/DT_REPORT_OUTLINE.md](docs/DT_REPORT_OUTLINE.md) · [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md)
- **Legal:** [docs/LEGAL.md](docs/LEGAL.md) — in-app Terms/Privacy (v1.0) in Profile → Legal, DPDP rights (export/delete built in), Play Data Safety guidance, and the honest note that these are solid templates, not a lawyer's review.

## Environment variables
Only `EXPO_PUBLIC_FIREBASE_*` (public client identifiers — security comes from Auth + Firestore rules, never from hiding them) and optional `EXPO_PUBLIC_OCR_API_URL`. **No service-account key, no secrets in the app. Ever.** `.env` is git-ignored.
