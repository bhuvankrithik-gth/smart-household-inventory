# Architecture — Smart Household Inventory

**Stack (as built):** React Native + Expo SDK 58 (TypeScript), Expo Router (routes in `src/app/`, following the template's house rules), React Hook Form + Zod validation patterns, TanStack Query provider installed/wired at the root, custom lightweight bar charts (real data only, no chart-lib incompatibility risk), AsyncStorage local-first store, Firebase Auth + Cloud Firestore cloud layer (NoSQL — no SQL anywhere in the final design).

```
UI screens (src/app) ──> Store (src/data/store.tsx, React context)
                            │  repository/data-layer abstraction: all screens call Store actions only
                            ├─> Local repository: AsyncStorage JSON DB (`shi-db-v3`), works offline on any phone, no account needed
                            ├─> Business logic (src/lib/logic.ts, assistant.ts, recipes.ts) — pure, unit-tested
                            └─> Cloud layer (src/lib/firebase.ts): Firebase app/Auth/Firestore initialised from
                                EXPO_PUBLIC_FIREBASE_* env bundled at build time via app.config.js extra.
                                Sync = household documents written/read per collection map below, guarded by firestore.rules.
                                Pending local operations are queued in `pendingOps` with stable opIds (idempotency).
```

## Firestore collection map (replaces a SQL ER diagram — this project is NoSQL)
- `profiles/{uid}` — name, email, termsAcceptedAt, termsVersion.
- `households/{householdId}` — name, ownerId, inviteCode, `memberIds[]`; subcollection `members/{uid}`.
- Household-scoped top-level collections (each doc: `householdId`, `memberIds[]`, timestamps): `inventoryItems`, `batches`, `stockMovements`, `shoppingLists`, `shoppingListItems`, `purchases`, `purchaseItems`, `priceHistory`, `wasteRecords`, `notifications`, `householdGoals`, `auditEvents`.
- Isolation: `firestore.rules` allows reads/writes only when `request.auth.uid ∈ memberIds`. Changing an id in a request does not grant access.

## Stock correctness
Typed movements (received / consumed / discarded / transferred / corrected / purchased) go through the pure `applyMovement` engine: duplicate `opId`s are no-ops, consumption is FIFO by earliest expiry, and any movement that would drive stock negative throws. Shopping purchase uses a stable `purchaseOpId` on the shopping item → inventory increments exactly once.

## Offline / sync strategy
Local-first: every workflow works offline against AsyncStorage. Each mutation records `{opId, kind, createdAt, synced:false}` in the pending queue. When Firebase is configured **and** rules are published, a sync pass can push pending ops per household (integration point in `src/lib/firebase.ts`); conflicts surface as pending (never silently overwritten) — see KNOWN_LIMITATIONS for what is verified vs. integration-ready.

## Laptop compatibility
Expo web target with a centred max-width (860px) responsive layout — same codebase, wider screens on laptop, ~360px phones supported (default Expo min SDK is kept; SDK 58 supports Android 7+).
