import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut, updateProfile, User as FBUser,
} from 'firebase/auth';
import {
  arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query,
  runTransaction, setDoc, where, writeBatch, DocumentReference,
} from 'firebase/firestore';
import { Batch, DB, Household, Item, Member, Movement, MovementType, Prefs, ShoppingItem, Unit, User, Waste, defaultPrefs } from '../lib/types';
import { applyMovement, findDuplicate, replenishment, uid } from '../lib/logic';
import { firebaseAuth, firestoreDb, friendlyAuthError, isOfflineError } from '../lib/firebase';

// ---------------------------------------------------------------------------
// v2.0 data layer: Firebase Auth is the only account system and Firestore is
// the only database. The context keeps the exact shape the screens were built
// against (a `db` object + hh* slices); slices are live onSnapshot views of the
// current household's collections, mirrored to AsyncStorage so the app opens
// with data while offline. See docs/ARCHITECTURE.md for the data map.
// ---------------------------------------------------------------------------
const auth = firebaseAuth;
const fs = firestoreDb;
const SCOPED: [string, string][] = [
  // [local slice name, Firestore collection]
  ['items', 'inventoryItems'], ['batches', 'batches'], ['movements', 'stockMovements'],
  ['lists', 'shoppingLists'], ['shopping', 'shoppingListItems'], ['purchases', 'purchases'],
  ['prices', 'priceHistory'], ['waste', 'wasteRecords'],
];
const cacheKey = (u: string) => `shi-cloud-cache-v1:${u}`;
const pendingKey = (u: string) => `shi-pending-v1:${u}`;
const currentHhKey = (u: string) => `shi-current-hh:${u}`;
const migratedKey = (u: string) => `shi-migrated-v1:${u}`;

// Firestore rejects `undefined` field values — strip them (deeply) pre-write.
function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(x => clean(x)) as T;
  if (v && typeof v === 'object') { const out: any = {}; for (const [k, val] of Object.entries(v as any)) if (val !== undefined) out[k] = clean(val); return out; }
  return v;
}
function strip<T extends { id: string }>(o: T): Record<string, any> { const rest: any = { ...(o as any) }; delete rest.id; return clean(rest); }
function genInviteCode() { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]; return s; }

// ----- serialisable offline intents (doc writes replay verbatim; stock ops
// ----- re-run their transaction with the original opId, staying idempotent)
type DocOp = { op: 'set' | 'update' | 'delete'; path: string; data?: Record<string, any> };
type Intent =
  | { id: string; kind: 'docs'; ops: DocOp[]; createdAt: string }
  | { id: string; kind: 'adjust'; movement: Movement; item: Item; createdAt: string }
  | { id: string; kind: 'purchase'; item: ShoppingItem; actualQty: number; actualPrice: number; opId: string; userId: string; userName: string; createdAt: string };

async function execDocOps(ops: DocOp[]): Promise<void> {
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(fs!);
    for (const o of ops.slice(i, i + 400)) {
      const ref = doc(fs!, o.path);
      if (o.op === 'set') b.set(ref, clean(o.data || {}));
      else if (o.op === 'update') b.update(ref, clean(o.data || {}));
      else b.delete(ref);
    }
    await b.commit();
  }
}

// Stock adjustment as ONE transaction: recompute the item's batches with the
// pure applyMovement engine against server state, write back the diff, append
// the movement, and mark the op processed on the household doc (idempotency).
async function execAdjustTx(m: Movement, item: Item): Promise<void> {
  const hid = item.householdId;
  const bq = await getDocs(query(collection(fs!, 'batches'), where('householdId', '==', hid), where('itemId', '==', item.id)));
  const batchRefs = bq.docs.map(d => d.ref);
  await runTransaction(fs!, async (tx) => {
    const hhRef = doc(fs!, 'households', hid);
    const hhSnap = await tx.get(hhRef);
    if (!hhSnap.exists()) throw new Error('Household not found');
    const processed: string[] = (hhSnap.data() as any).processedOps || [];
    if (processed.includes(m.opId)) return; // duplicate op: already applied exactly once
    const snaps = await Promise.all(batchRefs.map(r => tx.get(r)));
    const cur: Batch[] = snaps.filter(s => s.exists()).map(s => ({ ...(s.data() as any), id: s.id }));
    const st = applyMovement({ batches: cur, processedOps: processed }, m, item); // throws on negative stock
    let out = st.batches;
    if (m.type === 'transferred' && m.toLocation) out = out.map(b => ({ ...b, location: m.toLocation! }));
    const beforeIds = new Set(cur.map(b => b.id));
    const afterIds = new Set(out.map(b => b.id));
    for (const b of out) { const ref = doc(fs!, 'batches', b.id); if (beforeIds.has(b.id)) tx.update(ref, strip(b)); else tx.set(ref, strip(b)); }
    for (const b of cur) if (!afterIds.has(b.id)) tx.delete(doc(fs!, 'batches', b.id));
    tx.set(doc(fs!, 'stockMovements', m.id), strip(m));
    if (m.type === 'transferred' && m.toLocation) tx.update(doc(fs!, 'inventoryItems', item.id), { location: m.toLocation, updatedAt: new Date().toISOString() });
    if (m.type === 'discarded') {
      const w: Waste = { id: uid('waste'), householdId: hid, itemId: item.id, name: item.name, qty: m.qty, unit: item.unit, date: new Date().toISOString().slice(0, 10), reason: m.reason || 'Discarded' };
      tx.set(doc(fs!, 'wasteRecords', w.id), strip(w));
    }
    tx.update(hhRef, { processedOps: arrayUnion(m.opId) });
  });
}

type PurchaseOutcome = 'ok' | 'already-purchased' | 'already-recorded';
// Purchase → inventory exactly once: the processedOps check, the shopping
// item flip, the stock movement and the purchase record commit atomically.
async function execPurchaseTx(s: ShoppingItem, actualQty: number, actualPrice: number, opId: string, userId: string, userName: string): Promise<PurchaseOutcome> {
  const hid = s.householdId;
  const itemsSnap = await getDocs(query(collection(fs!, 'inventoryItems'), where('householdId', '==', hid)));
  const allItems: Item[] = itemsSnap.docs.map(d => ({ ...(d.data() as any), id: d.id }));
  let target = allItems.find(i => i.id === s.itemId) || allItems.find(i => i.name.toLowerCase() === s.name.toLowerCase());
  let batchRefs: DocumentReference[] = [];
  if (target) { const bq = await getDocs(query(collection(fs!, 'batches'), where('householdId', '==', hid), where('itemId', '==', target.id))); batchRefs = bq.docs.map(d => d.ref); }
  let outcome: PurchaseOutcome = 'ok';
  await runTransaction(fs!, async (tx) => {
    const hhRef = doc(fs!, 'households', hid);
    const hhSnap = await tx.get(hhRef);
    if (!hhSnap.exists()) throw new Error('Household not found');
    const processed: string[] = (hhSnap.data() as any).processedOps || [];
    if (processed.includes(opId)) { outcome = 'already-recorded'; return; }
    const shopRef = doc(fs!, 'shoppingListItems', s.id);
    const shopSnap = await tx.get(shopRef);
    if (!shopSnap.exists() || (shopSnap.data() as any).status === 'purchased') { outcome = 'already-purchased'; return; }
    let tgt = target;
    if (!tgt) {
      tgt = { id: uid('item'), householdId: hid, name: s.name, category: 'Other household essentials', unit: s.unit, minQty: 1, location: 'Pantry', archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: userName };
      tx.set(doc(fs!, 'inventoryItems', tgt.id), strip(tgt));
    }
    const snaps = await Promise.all(batchRefs.map(r => tx.get(r)));
    const cur: Batch[] = snaps.filter(x => x.exists()).map(x => ({ ...(x.data() as any), id: x.id }));
    const mv: Movement = { id: uid('mv'), opId, householdId: hid, itemId: tgt.id, type: 'purchased', qty: actualQty, unit: tgt.unit, userId, userName, createdAt: new Date().toISOString(), batchId: uid('batch') };
    const st = applyMovement({ batches: cur, processedOps: processed }, mv, tgt);
    const beforeIds = new Set(cur.map(b => b.id));
    for (const b of st.batches) { const ref = doc(fs!, 'batches', b.id); if (beforeIds.has(b.id)) tx.update(ref, strip(b)); else tx.set(ref, strip(b)); }
    tx.set(doc(fs!, 'stockMovements', mv.id), strip(mv));
    tx.update(shopRef, { status: 'purchased', actualQty, actualPrice, purchaseOpId: opId });
    const purId = uid('pur');
    tx.set(doc(fs!, 'purchases', purId), clean({ opId, householdId: hid, total: actualPrice, createdAt: new Date().toISOString(), userName, items: [{ name: s.name, qty: actualQty, unit: s.unit, price: actualPrice, category: tgt.category, itemId: tgt.id }] }));
    tx.set(doc(fs!, 'priceHistory', uid('price')), clean({ householdId: hid, name: s.name, price: actualPrice, qty: actualQty, unit: s.unit, date: new Date().toISOString().slice(0, 10) }));
    tx.update(hhRef, { processedOps: arrayUnion(opId) });
  });
  return outcome;
}

async function execIntent(it: Intent): Promise<void> {
  if (it.kind === 'docs') return execDocOps(it.ops);
  if (it.kind === 'adjust') return execAdjustTx(it.movement, it.item);
  await execPurchaseTx(it.item, it.actualQty, it.actualPrice, it.opId, it.userId, it.userName);
}

async function deleteHouseholdInternal(h: Household): Promise<void> {
  const refs: DocumentReference[] = [];
  for (const [, coll] of SCOPED) { const q = await getDocs(query(collection(fs!, coll), where('householdId', '==', h.id))); q.forEach(d => refs.push(d.ref)); }
  const mem = await getDocs(collection(fs!, `households/${h.id}/members`)); mem.forEach(d => refs.push(d.ref));
  if (h.inviteCode) refs.push(doc(fs!, 'inviteCodes', h.inviteCode));
  refs.push(doc(fs!, 'households', h.id));
  for (let i = 0; i < refs.length; i += 400) { const b = writeBatch(fs!); refs.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit(); }
}

export interface Store {
  db: DB; ready: boolean; user?: User; household?: Household;
  hhItems: Item[]; hhBatches: DB['batches']; hhMovements: DB['movements']; hhShopping: ShoppingItem[]; hhLists: DB['lists']; hhPurchases: DB['purchases']; hhWaste: DB['waste']; members: Member[];
  register: (n: string, e: string, p: string) => Promise<string | null>; login: (e: string, p: string) => Promise<string | null>; logout: () => Promise<void>; resetPassword: (e: string) => Promise<string>;
  deleteHouseholdData: () => Promise<string | null>; deleteAccount: () => Promise<string | null>;
  createHousehold: (name: string) => Promise<string | null>; joinHousehold: (code: string) => Promise<string | null>; switchHousehold: (id: string) => void; leaveHousehold: () => Promise<void>; removeMember: (id: string) => Promise<void>; regenerateInviteCode: () => Promise<string | null>;
  addItem: (data: any, qty: number, price?: number, expiry?: string) => Promise<string>; editItem: (id: string, data: any) => Promise<void>; archiveItem: (id: string) => Promise<void>; deleteItem: (id: string) => Promise<void>;
  adjust: (itemId: string, type: MovementType, qty: number, reason?: string, toLocation?: string) => Promise<string | null>;
  addList: (name: string) => void; addShopping: (name: string, qty: number, unit: Unit, price?: number, itemId?: string, listId?: string) => { dup: string | null; id: string }; removeShopping: (id: string) => void; purchaseShopping: (id: string, actualQty: number, actualPrice: number) => Promise<string | null>; generateSuggestions: () => number;
  addWaste: (w: any) => void; updatePrefs: (p: Partial<Prefs>) => void; exportJSON: () => string; consumeRecipe: (names: string[]) => void;
}
const Ctx = createContext<Store | null>(null);
export function useStore() { const s = useContext(Ctx); if (!s) throw new Error('store missing'); return s; }

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState<boolean>(() => !auth || !fs); // no cloud config → nothing to wait for
  const [fbUser, setFbUser] = useState<FBUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [members, setMembers] = useState<Member[]>([]); // real members of the CURRENT household
  const [items, setItems] = useState<Item[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [lists, setLists] = useState<DB['lists']>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [purchases, setPurchases] = useState<DB['purchases']>([]);
  const [prices, setPrices] = useState<DB['prices']>([]);
  const [waste, setWaste] = useState<DB['waste']>([]);
  const [currentHouseholdId, setCurrentHouseholdId] = useState<string | undefined>(undefined);
  const [slicesHid, setSlicesHid] = useState<string | undefined>(undefined); // household the data slices currently belong to
  const [devicePrefs, setDevicePrefs] = useState<Prefs>(defaultPrefs);
  const [pending, setPending] = useState<Intent[]>([]);

  const uidRef = useRef<string | undefined>(undefined);
  const householdsRef = useRef<Household[]>([]);
  const currentHhRef = useRef<string | undefined>(undefined);
  const pendingRef = useRef<Intent[]>([]);
  const optimisticRef = useRef<Set<string>>(new Set()); // households written locally, snapshot not yet seen
  const migratedRef = useRef(false);
  const flushingRef = useRef(false);
  const authSubsRef = useRef<(() => void)[]>([]);

  // ---------- assembled db (same shape the screens were built against) ----------
  const user: User | undefined = profile || undefined;
  const household: Household | undefined = households.find(h => h.id === currentHouseholdId);
  const hid = household?.id;
  // Slices belong to the household they were hydrated/subscribed for; mask
  // them out whenever a different (or no) household is selected so one
  // household's rows can never render under another's name.
  const gated = useMemo(() => {
    const live = !!currentHouseholdId && slicesHid === currentHouseholdId;
    const pick = <T,>(arr: T[]): T[] => (live ? arr : []);
    return { items: pick(items), batches: pick(batches), movements: pick(movements), lists: pick(lists), shopping: pick(shopping), purchases: pick(purchases), prices: pick(prices), waste: pick(waste), members: pick(members) };
  }, [currentHouseholdId, slicesHid, items, batches, movements, lists, shopping, purchases, prices, waste, members]);
  const vItems = gated.items; const vBatches = gated.batches; const vMovements = gated.movements;
  const vLists = gated.lists; const vShopping = gated.shopping; const vPurchases = gated.purchases;
  const vPrices = gated.prices; const vWaste = gated.waste; const vMembers = gated.members;
  const membersAssembled: Member[] = useMemo(() => {
    if (!fbUser) return [];
    const others = households.filter(h => h.id !== currentHouseholdId).map(h => ({ id: `self-${h.id}`, householdId: h.id, userId: fbUser.uid, name: profile?.name || '', email: profile?.email || '', role: (h.ownerId === fbUser.uid ? 'owner' : 'member') as 'owner' | 'member', joinedAt: '' }));
    return [...vMembers, ...others];
  }, [vMembers, households, currentHouseholdId, fbUser, profile]);
  const prefs: Prefs = useMemo(() => ({ ...devicePrefs, budgetMonthly: household?.monthlyBudget ?? devicePrefs.budgetMonthly, currency: household?.currency ?? devicePrefs.currency }), [devicePrefs, household?.monthlyBudget, household?.currency]);
  const db: DB = useMemo(() => ({
    users: user ? [user] : [], currentUserId: fbUser?.uid, households, members: membersAssembled, currentHouseholdId,
    items: vItems, batches: vBatches, movements: vMovements, lists: vLists, shopping: vShopping, purchases: vPurchases, waste: vWaste, prices: vPrices,
    processedOps: household?.processedOps || [], prefs,
    pendingOps: pending.map(p => ({ opId: p.id, kind: p.kind, createdAt: p.createdAt, synced: false })), audit: [],
  }), [user, fbUser, households, membersAssembled, currentHouseholdId, vItems, vBatches, vMovements, vLists, vShopping, vPurchases, vWaste, vPrices, household, prefs, pending]);

  // ---------- helpers (ref-driven so the auth effect can use them safely) ----------
  function clearSlices() { setItems([]); setBatches([]); setMovements([]); setLists([]); setShopping([]); setPurchases([]); setPrices([]); setWaste([]); }
  function clearLocalState() { setProfile(null); setHouseholds([]); householdsRef.current = []; setMembers([]); clearSlices(); setSlicesHid(undefined); setCurrentHouseholdId(undefined); currentHhRef.current = undefined; setPending([]); pendingRef.current = []; optimisticRef.current.clear(); }
  function enqueue(it: Intent) { setPending(p => [...p, it]); }
  async function flushPending() {
    const u = uidRef.current; if (!u || !fs || flushingRef.current || !pendingRef.current.length) return;
    flushingRef.current = true;
    try { for (const it of [...pendingRef.current]) { try { await execIntent(it); setPending(p => p.filter(x => x.id !== it.id)); } catch { break; } } }
    finally { flushingRef.current = false; }
  }
  // Doc-write batch: live commit, or queue the same ops as one intent when offline.
  async function attemptDocs(ops: DocOp[]): Promise<boolean> {
    if (!fs) return false;
    try { await execDocOps(ops); return true; }
    catch (e) { if (isOfflineError(e)) { enqueue({ id: uid('intent'), kind: 'docs', ops, createdAt: new Date().toISOString() }); return false; } throw e; }
  }
  function patchHouseholdLocal(id: string, fields: Partial<Household>) { setHouseholds(hs => hs.map(h => h.id === id ? { ...h, ...fields } : h)); }
  function resolveCurrentHousehold(u: string, hs: Household[]) {
    const cur = currentHhRef.current;
    if (cur && (hs.some(h => h.id === cur) || optimisticRef.current.has(cur))) return;
    void (async () => {
      const saved = await AsyncStorage.getItem(currentHhKey(u)).catch(() => null);
      const pick = (saved && hs.some(h => h.id === saved)) ? saved : hs[0]?.id;
      currentHhRef.current = pick; setCurrentHouseholdId(pick);
    })();
  }
  async function hydrateFromCache(u: string) {
    try {
      const raw = await AsyncStorage.getItem(cacheKey(u)); if (!raw) return;
      const c = JSON.parse(raw) as DB; if (c.currentUserId !== u) return;
      setHouseholds(c.households || []); householdsRef.current = c.households || [];
      if (c.currentHouseholdId) { currentHhRef.current = c.currentHouseholdId; setCurrentHouseholdId(c.currentHouseholdId); }
      setItems(c.items || []); setBatches(c.batches || []); setMovements(c.movements || []); setLists(c.lists || []);
      setShopping(c.shopping || []); setPurchases(c.purchases || []); setPrices(c.prices || []); setWaste(c.waste || []);
      setMembers((c.members || []).filter(m => m.householdId === c.currentHouseholdId));
      setSlicesHid(c.currentHouseholdId);
    } catch { /* cache is best-effort */ }
  }
  // One-time upload of the old on-device (v1.x local) database into the cloud
  // account, the first time a cloud user with no households signs in here.
  async function maybeMigrate(u: FBUser, name: string, email: string, cloudCount: number) {
    try {
      const flag = migratedKey(u.uid);
      if (cloudCount > 0) { await AsyncStorage.setItem(flag, 'done').catch(() => {}); return; }
      if (await AsyncStorage.getItem(flag).catch(() => null)) return;
      const raw = await AsyncStorage.getItem('shi-db-v4').catch(() => null);
      if (!raw) { await AsyncStorage.setItem(flag, 'done').catch(() => {}); return; }
      const local = JSON.parse(raw) as DB;
      if (!local.households?.length) { await AsyncStorage.setItem(flag, 'done').catch(() => {}); return; }
      for (const hh of local.households) {
        const code = genInviteCode();
        await execDocOps([
          { op: 'set', path: `households/${hh.id}`, data: { name: hh.name, ownerId: u.uid, memberIds: [u.uid], inviteCode: code, createdAt: hh.createdAt || new Date().toISOString(), monthlyBudget: local.prefs?.budgetMonthly, currency: local.prefs?.currency, processedOps: (local.movements || []).filter(m => m.householdId === hh.id).map(m => m.opId) } },
          { op: 'set', path: `inviteCodes/${code}`, data: { householdId: hh.id } },
          { op: 'set', path: `households/${hh.id}/members/${u.uid}`, data: { userId: u.uid, name, email, role: 'owner', joinedAt: new Date().toISOString() } },
        ]);
        const slices: [any[] | undefined, string][] = [[local.items, 'inventoryItems'], [local.batches, 'batches'], [local.movements, 'stockMovements'], [local.lists, 'shoppingLists'], [local.shopping, 'shoppingListItems'], [local.purchases, 'purchases'], [local.prices, 'priceHistory'], [local.waste, 'wasteRecords']];
        for (const [arr, coll] of slices) {
          const mine = (arr || []).filter((x: any) => x.householdId === hh.id);
          const ops: DocOp[] = mine.map((d: any) => ({ op: 'set' as const, path: `${coll}/${d.id}`, data: strip(d) }));
          if (ops.length) await execDocOps(ops);
        }
      }
      await AsyncStorage.setItem(flag, 'done').catch(() => {});
    } catch { /* flag left unset: retried on a later launch */ }
  }

  // ---------- effects ----------
  useEffect(() => { AsyncStorage.getItem('shi-device-prefs').then(r => { if (r) { try { setDevicePrefs({ ...defaultPrefs, ...JSON.parse(r) }); } catch { /* ignore */ } } }).catch(() => {}); }, []);
  useEffect(() => { householdsRef.current = households; }, [households]);
  useEffect(() => { currentHhRef.current = currentHouseholdId; const u = uidRef.current; if (u && currentHouseholdId) AsyncStorage.setItem(currentHhKey(u), currentHouseholdId).catch(() => {}); }, [currentHouseholdId]);
  useEffect(() => { pendingRef.current = pending; const u = uidRef.current; if (u) AsyncStorage.setItem(pendingKey(u), JSON.stringify(pending)).catch(() => {}); }, [pending]);
  useEffect(() => { if (!fbUser) return; const t = setTimeout(() => { AsyncStorage.setItem(cacheKey(fbUser.uid), JSON.stringify(db)).catch(() => {}); }, 300); return () => clearTimeout(t); }, [db, fbUser]);
  useEffect(() => { const sub = AppState.addEventListener('change', st => { if (st === 'active') void flushPending(); }); return () => sub.remove(); }, []);

  useEffect(() => {
    if (!auth || !fs) return;
    const unsub = onAuthStateChanged(auth, async (u) => {
      authSubsRef.current.forEach(f => f()); authSubsRef.current = [];
      if (!u) { uidRef.current = undefined; setFbUser(null); clearLocalState(); setReady(true); return; }
      uidRef.current = u.uid; setFbUser(u); migratedRef.current = false;
      try { const raw = await AsyncStorage.getItem(pendingKey(u.uid)); const q = raw ? (JSON.parse(raw) as Intent[]) : []; setPending(q); pendingRef.current = q; } catch { /* ignore */ }
      await hydrateFromCache(u.uid);
      const fallback: User = { id: u.uid, name: u.displayName || (u.email || '').split('@')[0], email: u.email || '', createdAt: '' };
      authSubsRef.current.push(onSnapshot(doc(fs!, 'profiles', u.uid),
        (snap) => { if (snap.exists()) { const d = snap.data() as any; setProfile({ id: u.uid, name: d.displayName || fallback.name, email: d.email || fallback.email, createdAt: d.createdAt || '', termsAcceptedAt: d.termsAcceptedAt, termsVersion: d.termsVersion }); } else setProfile(fallback); },
        () => setProfile(fallback)));
      const hq = query(collection(fs!, 'households'), where('memberIds', 'array-contains', u.uid));
      authSubsRef.current.push(onSnapshot(hq,
        (snap) => {
          const hs: Household[] = snap.docs.map(d => ({ ...(d.data() as any), id: d.id }));
          hs.forEach(h => optimisticRef.current.delete(h.id));
          setHouseholds(hs); householdsRef.current = hs;
          resolveCurrentHousehold(u.uid, hs);
          if (!migratedRef.current) { migratedRef.current = true; void maybeMigrate(u, u.displayName || (u.email || '').split('@')[0], u.email || '', hs.length); }
          void flushPending();
        },
        () => { /* listener error (e.g. offline): keep the cached mirror on screen */ }));
      setReady(true);
    });
    return () => { unsub(); authSubsRef.current.forEach(f => f()); authSubsRef.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Current-household subscriptions: the 8 scoped collections + members.
  useEffect(() => {
    if (!fbUser || !fs || !currentHouseholdId) return;
    const hh = currentHouseholdId;
    const unsubs: (() => void)[] = [];
    const setters: Record<string, (docs: any[]) => void> = { inventoryItems: setItems, batches: setBatches, stockMovements: setMovements, shoppingLists: setLists, shoppingListItems: setShopping, purchases: setPurchases, priceHistory: setPrices, wasteRecords: setWaste };
    for (const [, coll] of SCOPED) {
      unsubs.push(onSnapshot(query(collection(fs, coll), where('householdId', '==', hh)),
        (snap) => { setSlicesHid(hh); const docs = snap.docs.map(d => ({ ...(d.data() as any), id: d.id })); setters[coll](((prev: any[]) => (snap.empty && snap.metadata.fromCache && prev.length ? prev : docs)) as any); },
        () => { /* keep the cached mirror */ }));
    }
    unsubs.push(onSnapshot(collection(fs, `households/${hh}/members`),
      (snap) => { setSlicesHid(hh); const docs = snap.docs.map(d => ({ ...(d.data() as any), id: d.id, userId: d.id, householdId: hh })); setMembers(prev => (snap.empty && snap.metadata.fromCache && prev.length ? prev : docs)); },
      () => { /* keep the cached mirror */ }));
    return () => { unsubs.forEach(f => f()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbUser?.uid, currentHouseholdId]);

  // ---------- shared write paths ----------
  async function uniqueInviteCode(): Promise<string> {
    for (let i = 0; i < 5; i++) { const c = genInviteCode(); try { const s = await getDoc(doc(fs!, 'inviteCodes', c)); if (!s.exists()) return c; } catch { return c; } }
    return genInviteCode();
  }
  async function doAdjust(item: Item, type: MovementType, qty: number, reason?: string, toLocation?: string): Promise<string | null> {
    if (!fbUser) return 'Login first';
    const movement: Movement = { id: uid('mv'), opId: uid('op'), householdId: item.householdId, itemId: item.id, type, qty, unit: item.unit, reason, userId: fbUser.uid, userName: profile?.name || 'You', createdAt: new Date().toISOString(), toLocation };
    try { await execAdjustTx(movement, item); return null; }
    catch (e: any) {
      if (e?.message && String(e.message).includes('Insufficient stock')) return e.message as string;
      if (isOfflineError(e)) { enqueue({ id: uid('intent'), kind: 'adjust', movement, item, createdAt: new Date().toISOString() }); return null; }
      return (e?.message as string) || 'Could not adjust stock';
    }
  }
  function doAddShopping(name: string, qty: number, unit: Unit, price?: number, itemId?: string, listId?: string): { dup: string | null; id: string } {
    const dup = findDuplicate(name, [...db.shopping.filter(s => s.householdId === hid && s.status === 'pending').map(s => s.name), ...db.items.filter(i => i.householdId === hid).map(i => i.name)]);
    const id = uid('shop');
    const lid = listId || db.lists.find(l => l.householdId === hid)?.id || 'default';
    if (hid) {
      const entry: ShoppingItem = { id, householdId: hid, listId: lid, name, qty, unit, expectedPrice: price, priority: 'medium', status: 'pending', itemId, createdAt: new Date().toISOString() };
      void attemptDocs([{ op: 'set', path: `shoppingListItems/${id}`, data: strip(entry) }]).catch(() => {});
    }
    return { dup, id };
  }

  // ---------- context API ----------
  const api: Store = useMemo(() => ({
    db, ready, user, household,
    hhItems: vItems, hhBatches: vBatches, hhMovements: vMovements, hhShopping: vShopping, hhLists: vLists, hhPurchases: vPurchases, hhWaste: vWaste, members: membersAssembled,
    async register(n, e, p) {
      if (!auth || !fs) return 'Cloud accounts are not configured in this build.';
      try {
        const cred = await createUserWithEmailAndPassword(auth, e.trim(), p);
        await updateProfile(cred.user, { displayName: n }).catch(() => {});
        const now = new Date().toISOString();
        await setDoc(doc(fs, 'profiles', cred.user.uid), { displayName: n, email: e.trim(), createdAt: now, termsAcceptedAt: now, termsVersion: '1.0' });
        return null;
      } catch (err) { return friendlyAuthError(err); }
    },
    async login(e, p) {
      if (!auth) return 'Cloud accounts are not configured in this build.';
      try { await signInWithEmailAndPassword(auth, e.trim(), p); return null; } catch (err) { return friendlyAuthError(err); }
    },
    async logout() {
      const u = uidRef.current;
      if (auth) { try { await signOut(auth); } catch { /* listener clears state regardless */ } }
      if (u) await AsyncStorage.removeItem(currentHhKey(u)).catch(() => {});
      if (!auth) { uidRef.current = undefined; setFbUser(null); clearLocalState(); }
    },
    async resetPassword(e) {
      if (!auth) return 'Cloud accounts are not configured in this build.';
      try { await sendPasswordResetEmail(auth, e.trim()); return 'If an account exists for that email, a password reset link has been sent.'; }
      catch (err: any) { const c = String(err?.code || ''); if (c.includes('invalid-email')) return 'That email address looks invalid.'; if (c.includes('network')) return 'Network problem — check your connection and try again.'; return 'If an account exists for that email, a password reset link has been sent.'; }
    },
    async createHousehold(name) {
      if (!fbUser || !profile) return 'Login first';
      const hhId = uid('hh'); const code = await uniqueInviteCode(); const now = new Date().toISOString();
      const ops: DocOp[] = [
        { op: 'set', path: `households/${hhId}`, data: { name: name.trim(), ownerId: fbUser.uid, memberIds: [fbUser.uid], inviteCode: code, createdAt: now, processedOps: [] } },
        { op: 'set', path: `inviteCodes/${code}`, data: { householdId: hhId } },
        { op: 'set', path: `households/${hhId}/members/${fbUser.uid}`, data: { userId: fbUser.uid, name: profile.name, email: profile.email, role: 'owner', joinedAt: now } },
        { op: 'set', path: `shoppingLists/${uid('list')}`, data: { householdId: hhId, name: 'Weekly Shopping', createdAt: now } },
      ];
      optimisticRef.current.add(hhId); currentHhRef.current = hhId; setCurrentHouseholdId(hhId);
      try { await attemptDocs(ops); return null; } catch { return 'Could not create the household. Please try again.'; }
    },
    async joinHousehold(codeRaw) {
      if (!fbUser || !profile) return 'Login first';
      if (!fs) return 'Cloud is not configured in this build.';
      const code = codeRaw.trim().toUpperCase(); if (!code) return 'Invalid invite code.';
      let target = '';
      try { const s = await getDoc(doc(fs, 'inviteCodes', code)); if (!s.exists()) return 'Invalid invite code.'; target = (s.data() as any).householdId as string; }
      catch (e) { if (isOfflineError(e)) return 'You appear to be offline — joining a household needs a connection the first time.'; return 'Invalid invite code.'; }
      if (householdsRef.current.some(h => h.id === target)) { currentHhRef.current = target; setCurrentHouseholdId(target); return null; }
      try {
        const b = writeBatch(fs);
        b.set(doc(fs, `households/${target}/members/${fbUser.uid}`), { userId: fbUser.uid, name: profile.name, email: profile.email, role: 'member', joinedAt: new Date().toISOString() });
        b.update(doc(fs, 'households', target), { memberIds: arrayUnion(fbUser.uid) });
        await b.commit();
      } catch (e) { if (isOfflineError(e)) return 'You appear to be offline — joining a household needs a connection the first time.'; return 'Could not join with that code. It may be invalid or expired.'; }
      optimisticRef.current.add(target); currentHhRef.current = target; setCurrentHouseholdId(target);
      return null;
    },
    switchHousehold(id) { if (!fbUser) return; if (!householdsRef.current.some(h => h.id === id) && !optimisticRef.current.has(id)) return; currentHhRef.current = id; setCurrentHouseholdId(id); },
    async leaveHousehold() {
      if (!fbUser || !hid || !household) return;
      const ops: DocOp[] = [
        { op: 'delete', path: `households/${hid}/members/${fbUser.uid}` },
        { op: 'update', path: `households/${hid}`, data: { memberIds: (household.memberIds || []).filter(x => x !== fbUser.uid) } },
      ];
      try { await attemptDocs(ops); } catch { /* queued or failed silently; snapshot stays authoritative */ }
      const next = households.find(h => h.id !== hid)?.id; currentHhRef.current = next; setCurrentHouseholdId(next);
    },
    async removeMember(id) {
      if (!fbUser || !hid || !household) return;
      if (household.ownerId !== fbUser.uid || id === fbUser.uid) return; // owner-only, never self here
      const ops: DocOp[] = [
        { op: 'delete', path: `households/${hid}/members/${id}` },
        { op: 'update', path: `households/${hid}`, data: { memberIds: (household.memberIds || []).filter(x => x !== id) } },
      ];
      try { await attemptDocs(ops); } catch { /* snapshot stays authoritative */ }
    },
    async regenerateInviteCode() {
      if (!fbUser || !hid || !household) return 'No household selected.';
      const code = await uniqueInviteCode();
      const ops: DocOp[] = [
        { op: 'update', path: `households/${hid}`, data: { inviteCode: code } },
        { op: 'set', path: `inviteCodes/${code}`, data: { householdId: hid } },
        ...(household.inviteCode ? [{ op: 'delete', path: `inviteCodes/${household.inviteCode}` } as DocOp] : []),
      ];
      try { await attemptDocs(ops); patchHouseholdLocal(hid, { inviteCode: code }); return null; }
      catch { return 'Could not regenerate the invite code. Please try again.'; }
    },
    async addItem(data, qty, price, expiry) {
      const id = uid('item');
      if (!hid || !fbUser) return id;
      const now = new Date().toISOString();
      const item: Item = { id, householdId: hid, createdAt: now, updatedAt: now, createdBy: profile?.name || 'You', archived: false, ...data };
      const opId = uid('op'); const mvId = uid('mv');
      const movement: Movement = { id: mvId, opId, householdId: hid, itemId: id, type: 'received', qty, unit: item.unit, userId: fbUser.uid, userName: profile?.name || 'You', createdAt: now };
      const ops: DocOp[] = [{ op: 'set', path: `inventoryItems/${id}`, data: strip(item) }];
      if (qty > 0) {
        const st = applyMovement({ batches: [], processedOps: [] }, { ...movement, batchId: uid('batch') }, item);
        const b = st.batches[0];
        if (b) ops.push({ op: 'set', path: `batches/${b.id}`, data: strip({ ...b, expiryDate: expiry || undefined, purchasePrice: price, noExpiry: !expiry }) });
        ops.push({ op: 'update', path: `households/${hid}`, data: { processedOps: [...(household?.processedOps || []), opId] } });
      }
      ops.push({ op: 'set', path: `stockMovements/${mvId}`, data: strip(movement) });
      if (price) { const pid = uid('price'); ops.push({ op: 'set', path: `priceHistory/${pid}`, data: { householdId: hid, name: item.name, price, qty, unit: item.unit, date: now.slice(0, 10) } }); }
      await attemptDocs(ops).catch(() => false);
      return id;
    },
    async editItem(id, data) { await attemptDocs([{ op: 'update', path: `inventoryItems/${id}`, data: { ...data, updatedAt: new Date().toISOString() } }]).catch(() => false); },
    async archiveItem(id) { await attemptDocs([{ op: 'update', path: `inventoryItems/${id}`, data: { archived: true } }]).catch(() => false); },
    async deleteItem(id) {
      const ops: DocOp[] = [{ op: 'delete', path: `inventoryItems/${id}` }, ...db.batches.filter(b => b.itemId === id).map(b => ({ op: 'delete' as const, path: `batches/${b.id}` }))];
      await attemptDocs(ops).catch(() => false);
    },
    adjust(itemId, type, qty, reason, toLocation) { const item = db.items.find(i => i.id === itemId); if (!item) return Promise.resolve('Item not found'); return doAdjust(item, type, qty, reason, toLocation); },
    addList(name) { if (hid) void attemptDocs([{ op: 'set', path: `shoppingLists/${uid('list')}`, data: { householdId: hid, name, createdAt: new Date().toISOString() } }]).catch(() => {}); },
    addShopping(name, qty, unit, price, itemId, listId) { return doAddShopping(name, qty, unit, price, itemId, listId); },
    removeShopping(id) { void attemptDocs([{ op: 'delete', path: `shoppingListItems/${id}` }]).catch(() => {}); },
    async purchaseShopping(id, actualQty, actualPrice) {
      const s = db.shopping.find(x => x.id === id); if (!s) return 'Not found';
      if (s.status === 'purchased') return 'Already purchased — inventory was updated exactly once for this item.';
      if (!fbUser) return 'Login first';
      const opId = s.purchaseOpId || uid('op');
      try {
        const r = await execPurchaseTx(s, actualQty, actualPrice, opId, fbUser.uid, profile?.name || 'You');
        if (r === 'already-recorded') return 'Already recorded (duplicate prevented).';
        if (r === 'already-purchased') return 'Already purchased — inventory was updated exactly once for this item.';
        return null;
      } catch (e: any) {
        if (isOfflineError(e)) { enqueue({ id: uid('intent'), kind: 'purchase', item: s, actualQty, actualPrice, opId, userId: fbUser.uid, userName: profile?.name || 'You', createdAt: new Date().toISOString() }); return null; }
        return (e?.message as string) || 'Could not record the purchase';
      }
    },
    generateSuggestions() {
      if (!hid) return 0; let count = 0;
      const existing = new Set(db.shopping.filter(s => s.householdId === hid && s.status === 'pending').map(s => s.name.toLowerCase()));
      for (const item of db.items.filter(i => i.householdId === hid && !i.archived)) { const r = replenishment(item, db.batches, db.movements); if (r.needsBuy && !existing.has(item.name.toLowerCase())) { doAddShopping(item.name, Math.max(1, r.suggestedQty), item.unit, undefined, item.id); count++; } }
      return count;
    },
    addWaste(w) { if (hid) { const entry = { id: uid('waste'), householdId: hid, ...w }; void attemptDocs([{ op: 'set', path: `wasteRecords/${entry.id}`, data: strip(entry) }]).catch(() => {}); } },
    updatePrefs(p) {
      const { budgetMonthly, currency, ...rest } = p;
      let next: Prefs | null = null;
      if (Object.keys(rest).length) next = { ...devicePrefs, ...rest };
      const hhFields: Record<string, any> = {};
      if (budgetMonthly !== undefined) hhFields.monthlyBudget = budgetMonthly;
      if (currency !== undefined) hhFields.currency = currency;
      if (Object.keys(hhFields).length) {
        if (household) { void attemptDocs([{ op: 'update', path: `households/${household.id}`, data: hhFields }]).catch(() => {}); patchHouseholdLocal(household.id, hhFields as Partial<Household>); }
        else { next = { ...(next || devicePrefs), budgetMonthly: budgetMonthly ?? (next || devicePrefs).budgetMonthly, currency: currency ?? (next || devicePrefs).currency }; }
      }
      if (next) { setDevicePrefs(next); AsyncStorage.setItem('shi-device-prefs', JSON.stringify(next)).catch(() => {}); }
    },
    exportJSON() { return JSON.stringify(db, null, 2); },
    async deleteHouseholdData() {
      if (!household || !fbUser) return null;
      if (household.ownerId !== fbUser.uid) return 'Only the household owner can delete this household and its data.';
      try { await deleteHouseholdInternal(household); currentHhRef.current = undefined; setCurrentHouseholdId(undefined); return null; }
      catch (e) { if (isOfflineError(e)) return 'Deleting a household needs a connection — try again when you are online.'; return 'Could not delete the household. Please try again.'; }
    },
    async deleteAccount() {
      if (!fbUser || !fs) return 'Login first';
      try {
        for (const h of householdsRef.current) {
          if (h.ownerId === fbUser.uid) await deleteHouseholdInternal(h);
          else {
            const b = writeBatch(fs);
            b.delete(doc(fs, `households/${h.id}/members/${fbUser.uid}`));
            b.update(doc(fs, 'households', h.id), { memberIds: (h.memberIds || []).filter(x => x !== fbUser.uid) });
            await b.commit();
          }
        }
        await deleteDoc(doc(fs, 'profiles', fbUser.uid));
      } catch (e) { if (isOfflineError(e)) return 'Deleting your account needs a connection — try again when you are online.'; return 'Could not delete your data. Please try again.'; }
      try { await fbUser.delete(); } catch (e) { return friendlyAuthError(e); }
      await AsyncStorage.multiRemove([cacheKey(fbUser.uid), currentHhKey(fbUser.uid), pendingKey(fbUser.uid)]).catch(() => {});
      return null;
    },
    consumeRecipe(names) { names.forEach(n => { const item = db.items.find(i => i.householdId === hid && i.name === n); if (item) void doAdjust(item, 'consumed', item.unit === 'kg' || item.unit === 'g' ? 0.1 : 1, 'Used in recipe'); }); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [db, ready, user, household, hid, vItems, vBatches, vMovements, vLists, vShopping, vPurchases, vWaste, membersAssembled, fbUser, profile, devicePrefs]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
