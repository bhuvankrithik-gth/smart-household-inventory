# Architecture — Smart Household Inventory

**Stack (as built):** React Native + Expo SDK 58 (TypeScript), Expo Router (routes in `src/app/`, following the template's house rules), Zod validation, custom lightweight bar charts (real data only), **Firebase Auth + Cloud Firestore as the only account/data system (v2.0)**, AsyncStorage used for (a) the Firebase Auth session on native, (b) an offline mirror of the signed-in user's data, (c) queued offline write intents.

```
UI screens (src/app) ──> Store (src/data/store.tsx, React context)
                            │  screens call Store actions only; the store assembles the
                            │  same `db` object shape the UI was built against
                            ├─> Firebase Auth (src/lib/firebase.ts): email/password accounts,
                            │     session persisted in AsyncStorage on native
                            ├─> Firestore: live onSnapshot subscriptions per household;
                            │     mutations write through as batches/transactions
                            ├─> Offline: AsyncStorage mirror `shi-cloud-cache-v1:{uid}`,
                            │     pending-write queue `shi-pending-v1:{uid}`
                            └─> Business logic (src/lib/logic.ts, assistant.ts, recipes.ts)
                                  — pure, unit-tested; the stock engine decides all
                                  batch math, Firestore just stores its results
```

## Auth flow
- Register: `createUserWithEmailAndPassword` → `profiles/{uid}` written with `{displayName, email, createdAt, termsAcceptedAt, termsVersion: '1.0'}`.
- Login: `signInWithEmailAndPassword`; auth state is driven by `onAuthStateChanged`. The root gate (`src/app/index.tsx`) routes signed-out users to `/login`.
- Password reset: `sendPasswordResetEmail`. Logout: `signOut` + clears in-memory state and the persisted current-household pointer.
- Errors are mapped to friendly strings (`friendlyAuthError` in `src/lib/firebase.ts`): email-in-use, weak-password, invalid-email, wrong-credentials, network, requires-recent-login.
- There are no local accounts and no passwords stored on-device any more (v1.x `users[]`/`passwordHash` machinery and the old local login path are gone).

## Firestore data map (NoSQL — replaces a SQL ER diagram)
- `profiles/{uid}` — `{displayName, email, createdAt, termsAcceptedAt, termsVersion}`. Owner-only (rules).
- `households/{hid}` — `{name, ownerId, memberIds: [uid, ...], inviteCode, createdAt, monthlyBudget?, currency?, processedOps?: string[]}`. `processedOps` is the idempotency ledger for stock operations of this household. `monthlyBudget`/`currency` are the household's budget settings (per-household in v2.0; device-only prefs like notification toggles stay in AsyncStorage).
- `households/{hid}/members/{uid}` — `{userId, name, email, role: 'owner'|'member', joinedAt}`. Document id == the member's uid.
- `inviteCodes/{CODE}` — `{householdId}`. The join directory: written at household creation, rotated by regenerate (new doc written, old doc deleted), deleted with the household.
- Household-scoped top-level collections — **every doc carries `householdId`** and is otherwise field-identical to the v1.x local shapes (`id` is the document id, not a field): `inventoryItems` (Item), `batches` (Batch), `stockMovements` (Movement), `shoppingLists` (ShoppingList), `shoppingListItems` (ShoppingItem), `purchases` (Purchase, line items embedded), `priceHistory` (PricePoint), `wasteRecords` (Waste). (`purchaseItems`, `notifications`, `householdGoals`, `auditEvents` exist in the rules' scoped list for future use; the app does not write them today.)
- Isolation: `firestore.rules` grants access to a scoped doc only when the household doc's `memberIds` (fetched with `get()`) contains `request.auth.uid`. A doc's own fields never grant access.

## Store flow & subscriptions
After sign-in the store (1) hydrates from the AsyncStorage mirror so the UI opens with data even offline, (2) subscribes to `households where memberIds array-contains uid`, (3) picks the current household (persisted choice if still a member, else the first household), and (4) subscribes to the 8 scoped collections (`where householdId == current`) plus the current household's `members` subcollection. Snapshots assemble the `db` object; every snapshot is mirrored back to AsyncStorage (`shi-cloud-cache-v1:{uid}`). Slice data is masked in the UI until it belongs to the selected household, so switching households can never render one household's rows under another's name.

## Mutations (all write through to Firestore)
- **addItem**: one batch — item doc, opening batch (computed with `applyMovement` and patched with expiry/price), the `received` movement, a price point when priced, and the opId appended to the household's `processedOps`.
- **adjust**: `runTransaction` — reads the household (idempotency check on `processedOps`), re-reads the item's batches, recomputes them with the pure `applyMovement` engine (FIFO-by-expiry consumption, negative stock throws), writes the batch diff + movement doc (+ waste record for `discarded`, item/batch location for `transferred`), and `arrayUnion`s the opId.
- **purchaseShopping**: `runTransaction` — exactly-once via the `processedOps` check inside the transaction; creates the inventory item when the shopping entry has none, applies the `purchased` movement, flips the shopping item to `purchased` with `purchaseOpId`, and writes the purchase + price-history docs.
- **Lists/shopping/waste/settings**: single-doc writes. Duplicate detection (`findDuplicate`) stays client-side against the live snapshot, as before.
- **Households**: create = batch (household doc + owner member doc + invite code doc + default list). Join by code = read `inviteCodes/{CODE}`, then one batch (own member doc + `memberIds arrayUnion self`) — enabled by the rules' dedicated join branch. Leave/removeMember = member doc delete + `memberIds` update. Regenerate code = household update + new code doc + old code doc delete. Switch = local selection only (validated against loaded households) and persisted per user.
- **Budget/currency**: written to the household doc; the assembled `prefs` reads them from there (other prefs are device-level).
- **Export**: JSON assembled from the loaded cloud data. **Household deletion** (owner): deletes every scoped doc of the household, its member docs, its invite code and the household doc. **Account deletion**: deletes owned households, removes the user from joined households, deletes the profile doc and the Firebase Auth user (`auth/requires-recent-login` surfaces as a friendly "log in again" error).

## Invite join flow (why the rules look the way they do)
A joiner is not yet a member, so they cannot read the household doc. The rules therefore (a) let any signed-in user read `inviteCodes/{CODE}` to resolve the household id, (b) let a user create their own `members/{uid}` doc when a *valid invite* exists (an `inviteCodes` doc named by the household's current `inviteCode` pointing back at that household), and (c) give household updates a narrow join branch: a non-member may change **only** `memberIds`, adding exactly themselves, while a valid invite exists. Everything else about the household doc is immutable to non-members.

## Offline behaviour (honest)
- Reads: the app opens on the AsyncStorage mirror; Firestore listeners refresh it when reachable and keep the mirror on listener errors.
- Writes: attempted immediately. On web the Firestore SDK queues internally; on native a failed write is captured as a serialised intent in `shi-pending-v1:{uid}` and replayed on the next successful households snapshot or when the app returns to the foreground. Stock operations replay with their original `opId`, so a replayed purchase/adjustment still applies exactly once; if a replayed adjustment no longer fits the server stock it is dropped by the engine's negative-stock guard.
- Conflicts are last-write-wins (no CRDT/operational transform) — two members editing the same record offline can overwrite each other. See KNOWN_LIMITATIONS.

## Migration from v1.x local data
On the first cloud sign-in on a device, if the cloud account has no households and the old on-device database (`shi-db-v4`) has any, they are uploaded once (households re-owned by the cloud uid, fresh invite codes, all slices with their original ids, `processedOps` rebuilt from the movements) and `shi-migrated-v1:{uid}` is set so it never repeats.

## Showcase dataset shape (`src/lib/showcase.ts`)
`buildShowcaseDataset(now?)` (alias `buildShowcaseData`) is a **pure builder** kept for seeding the cloud showcase account externally — the app no longer calls it. It returns plain objects:
`{ user, household, member, items, batches, movements, lists, shopping, purchases, prices, waste, processedOps, prefs }` in exactly the v1.x local shapes (see `src/lib/types.ts`). Seeding notes: create the Firebase Auth user first and remap every `user.id`/`ownerId`/`member.userId`/movement `userId` to the real Firebase uid (the builder's ids and `user.passwordHash` are local-era placeholders); write `household` to `households/{id}` adding `memberIds: [uid]`, `monthlyBudget`/`currency` from `prefs`, and `processedOps`; write `member` to `households/{id}/members/{uid}`; add an `inviteCodes/{household.inviteCode}` doc; write each slice to its mapped collection (map in the table above) with the doc id as the document id and `householdId` intact. All dates are relative to the build date so predictions/expiry states look right whenever it is opened.

## Stock correctness
Typed movements (received / consumed / discarded / transferred / corrected / purchased) go through the pure `applyMovement` engine inside Firestore transactions: duplicate `opId`s are no-ops, consumption is FIFO by earliest expiry, and any movement that would drive stock negative throws. Shopping purchase uses a stable `purchaseOpId` → inventory increments exactly once.

## Laptop compatibility
Expo web target with a centred max-width (860px) responsive layout — same codebase, wider screens on laptop, ~360px phones supported (SDK 58 supports Android 7+). On web, Firebase Auth uses its default browser persistence.
