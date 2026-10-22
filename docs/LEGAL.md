# Legal — what was implemented

> Honest framing: this kit **reduces** legal risk with standard, well-structured documents and working privacy controls. It does **not** — and nothing in this app claims to — guarantee you cannot be sued, and it is **not a lawyer's review**. Get an Indian lawyer to review before a commercial/public Play Store launch, paid features, or marketing claims.

## In-app
- Terms of Service + Privacy Policy screens (`src/app/terms.tsx`, `privacy.tsx`), version 1.0, "Last updated: 22 October 2026", readable offline.
- Registration requires ticking acceptance; `termsAcceptedAt` + `termsVersion` are stored on the user profile (local profile and, in cloud mode, `profiles/{uid}`).
- Login/Register link both documents. Age gate stated (18+ or parent/guardian consent).
- Privacy Policy: data collected (email, household/inventory/purchase/waste content, optional receipt photos), purposes, Firebase (Google) as cloud processor, sharing only with invited household members, no sale of data, no ad trackers, retention, security, DPDP Act 2023 rights. Grievance contact is a **clearly marked placeholder to be filled with the app owner's own email** — no fake address is hardcoded.
- Working rights, not just text: JSON data export, account deletion, and household-data deletion (Profile, both with confirmation). In cloud mode these also target owned Firestore documents / the Firebase Auth user where the SDK permits; consent withdrawal = deletion.
- Food-safety disclaimer (Terms + Home expiry card + Recipes): dates are user-entered guidance; the app never guarantees food safety. Budget disclaimer (Insights): budgeting aid, not financial advice.
- Permission honesty: camera/notification permissions are requested only from the user action that needs them, with an in-app explanation first.

## Content / IP hygiene
- Recipes: short, original, simple household recipes authored for this dataset (khichdi, dal tadka, parathas, etc. — generic preparations, no text copied from recipe sites or books).
- Barcode/product data: **no product database is scraped or bundled**; lookup is not auto-implemented, so unknown barcodes fall back to manual entry and no attribution is claimed. If Open Food Facts is added later, add in-app attribution "Data: Open Food Facts contributors, ODbL" on the scan screen and Licences screen before shipping it.
- No copyrighted images/logos/brand icons are bundled; icons are Expo/system vector icons. The app name is descriptive/generic — **re-check trademark availability before any commercial launch**.
- OSS licences screen lists the main libraries and licence types from package.json; it states it is a curated list of the main libraries, not a completeness claim. Copyright notice: © 2026 Smart Household Inventory / app owner.

## Play Store Data Safety (guidance for the form)
Declare: **Email address** (account), **User content** (inventory/purchase data, optional receipt photos), **App activity** (in-app actions). Data encrypted in transit (Firebase/TLS); data deletion available (in-app deletion + account deletion); no data shared with third parties except Firebase (Google) as processor for cloud mode; no ads/tracking.

## Platform dependence
Use is also subject to Google Firebase Terms, Google Play policies, and Expo/EAS Terms. Firebase is on the free Spark plan; EAS builds run under the owner's Expo account.
