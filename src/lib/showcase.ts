import { Batch, Household, Item, Member, Movement, MovementType, Prefs, PricePoint, Purchase, ShoppingItem, ShoppingList, User, Waste } from './types';
import { applyMovement, hashPassword, uid } from './logic';
// ---------- built-in showcase account ----------
// This account exists only in code: nothing is seeded at first run and no
// screen mentions it. It materialises (user + a full household dataset) the
// first time someone signs in with these credentials — see login() in
// src/data/store.tsx. After that it behaves like any other local account.
export const SHOWCASE_EMAIL = 'demo@shi.app';
export const SHOWCASE_PASSWORD = 'demo1234';
export const SHOWCASE_NAME = 'Aarav Sharma';

export interface ShowcaseDataset {
  user: User;
  household: Household;
  member: Member;
  items: Item[];
  batches: Batch[];
  movements: Movement[];
  lists: ShoppingList[];
  shopping: ShoppingItem[];
  purchases: Purchase[];
  prices: PricePoint[];
  waste: Waste[];
  processedOps: string[];
  prefs: Partial<Prefs>;
}

const DAY = 86400000;
function isoDaysAgo(now: Date, n: number) { return new Date(now.getTime() - n * DAY).toISOString(); }
// Local YYYY-MM-DD, n days from `now` (negative = in the past).
function dateFrom(now: Date, n: number) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface ItemSpec { key: string; name: string; category: string; unit: Item['unit']; minQty: number; location: string; firstDay: number }
const ITEM_SPECS: ItemSpec[] = [
  { key: 'rice',     name: 'Basmati Rice',        category: 'Grains, rice and flour',       unit: 'kg',     minQty: 2,    location: 'Pantry',    firstDay: 30 },
  { key: 'atta',     name: 'Whole Wheat Atta',    category: 'Grains, rice and flour',       unit: 'kg',     minQty: 2,    location: 'Pantry',    firstDay: 12 },
  { key: 'toor',     name: 'Toor Dal',            category: 'Pulses and legumes',           unit: 'kg',     minQty: 0.5,  location: 'Pantry',    firstDay: 15 },
  { key: 'moong',    name: 'Moong Dal',           category: 'Pulses and legumes',           unit: 'kg',     minQty: 0.5,  location: 'Pantry',    firstDay: 15 },
  { key: 'sunOil',   name: 'Sunflower Oil',       category: 'Oils, spices and condiments',  unit: 'l',      minQty: 1,    location: 'Kitchen',   firstDay: 30 },
  { key: 'mustOil',  name: 'Mustard Oil',         category: 'Oils, spices and condiments',  unit: 'l',      minQty: 0.25, location: 'Kitchen',   firstDay: 20 },
  { key: 'milk',     name: 'Milk',                category: 'Dairy and refrigerated',       unit: 'l',      minQty: 0.5,  location: 'Fridge',    firstDay: 2 },
  { key: 'curd',     name: 'Curd',                category: 'Dairy and refrigerated',       unit: 'kg',     minQty: 0.25, location: 'Fridge',    firstDay: 5 },
  { key: 'tomato',   name: 'Tomatoes',            category: 'Fruits and vegetables',        unit: 'kg',     minQty: 0.5,  location: 'Fridge',    firstDay: 2 },
  { key: 'potato',   name: 'Potatoes',            category: 'Fruits and vegetables',        unit: 'kg',     minQty: 1,    location: 'Store room', firstDay: 4 },
  { key: 'onion',    name: 'Onions',              category: 'Fruits and vegetables',        unit: 'kg',     minQty: 1,    location: 'Store room', firstDay: 4 },
  { key: 'turmeric', name: 'Turmeric Powder',     category: 'Oils, spices and condiments',  unit: 'g',      minQty: 50,   location: 'Kitchen',   firstDay: 25 },
  { key: 'chilli',   name: 'Red Chilli Powder',   category: 'Oils, spices and condiments',  unit: 'g',      minQty: 50,   location: 'Kitchen',   firstDay: 25 },
  { key: 'sugar',    name: 'Sugar',               category: 'Grains, rice and flour',       unit: 'kg',     minQty: 0.5,  location: 'Pantry',    firstDay: 18 },
  { key: 'tea',      name: 'Tea Powder',          category: 'Snacks and packaged foods',    unit: 'g',      minQty: 50,   location: 'Kitchen',   firstDay: 22 },
  { key: 'gel',      name: 'Dishwashing Gel',     category: 'Cleaning supplies',            unit: 'bottle', minQty: 1,    location: 'Kitchen',   firstDay: 20 },
  { key: 'soap',     name: 'Bath Soap',           category: 'Toiletries and personal care', unit: 'pcs',    minQty: 2,    location: 'Bathroom',  firstDay: 20 },
];

// Pure builder: returns every DB slice for the showcase household, with all
// dates relative to `now` so expiry states and run-out predictions look right
// whenever it is opened. Batches are produced by folding the movements through
// the app's own stock engine, so batch quantities always match movement math.
export function buildShowcaseDataset(now: Date = new Date()): ShowcaseDataset {
  const userId = uid('user');
  const householdId = uid('hh');
  const user: User = { id: userId, name: SHOWCASE_NAME, email: SHOWCASE_EMAIL, passwordHash: hashPassword(SHOWCASE_PASSWORD), createdAt: isoDaysAgo(now, 30), termsAcceptedAt: now.toISOString(), termsVersion: '1.0' };
  const household: Household = { id: householdId, name: 'Sharma Household', ownerId: userId, inviteCode: 'SHARMA', createdAt: isoDaysAgo(now, 30) };
  const member: Member = { id: uid('mem'), householdId, userId, name: SHOWCASE_NAME, email: SHOWCASE_EMAIL, role: 'owner', joinedAt: isoDaysAgo(now, 30) };

  const items: Item[] = ITEM_SPECS.map(s => ({ id: uid('item'), householdId, name: s.name, category: s.category, unit: s.unit, minQty: s.minQty, location: s.location, archived: false, createdAt: isoDaysAgo(now, s.firstDay), updatedAt: now.toISOString(), createdBy: SHOWCASE_NAME }));
  const byKey = new Map(ITEM_SPECS.map((s, i) => [s.key, items[i]]));
  const byId = new Map(items.map(i => [i.id, i]));
  const item = (key: string) => byKey.get(key)!;

  // ---- movement plan (folded chronologically through applyMovement below) ----
  const movements: Movement[] = [];
  const batchPatches = new Map<string, Partial<Batch>>();
  const mv = (key: string, type: MovementType, qty: number, daysAgo: number, opts?: { batchKey?: string; opId?: string; reason?: string; patch?: Partial<Batch> }) => {
    const it = item(key);
    const batchId = opts?.batchKey ? `showcase-batch-${opts.batchKey}` : undefined;
    if (batchId && opts?.patch) batchPatches.set(batchId, opts.patch);
    movements.push({ id: uid('mv'), opId: opts?.opId ?? uid('op'), householdId, itemId: it.id, batchId, type, qty, unit: it.unit, reason: opts?.reason, userId, userName: SHOWCASE_NAME, createdAt: isoDaysAgo(now, daysAgo) });
  };

  // Initial stocking, 30 days ago.
  mv('rice', 'received', 10, 30, { batchKey: 'rice-1', patch: { purchasePrice: 600, noExpiry: true } });
  mv('sunOil', 'received', 3, 30, { batchKey: 'oil-1', patch: { purchasePrice: 420, expiryDate: dateFrom(now, 150) } });
  // ~30 days of near-daily usage for the two staples the prediction engine tracks.
  for (let d = 29; d >= 10; d--) { mv('rice', 'consumed', 0.3, d, { reason: 'Daily cooking' }); mv('sunOil', 'consumed', 0.11, d, { reason: 'Daily cooking' }); }
  // Pantry / kitchen top-ups.
  mv('turmeric', 'received', 200, 25, { batchKey: 'turmeric', patch: { purchasePrice: 60, noExpiry: true } });
  mv('chilli', 'received', 200, 25, { batchKey: 'chilli', patch: { purchasePrice: 70, noExpiry: true } });
  mv('tea', 'received', 250, 22, { batchKey: 'tea', patch: { purchasePrice: 140, noExpiry: true } });
  mv('mustOil', 'received', 1, 20, { batchKey: 'mustard', patch: { purchasePrice: 180, expiryDate: dateFrom(now, 120) } });
  mv('gel', 'received', 2, 20, { batchKey: 'gel', patch: { purchasePrice: 198, noExpiry: true } });
  mv('soap', 'received', 4, 20, { batchKey: 'soap', patch: { purchasePrice: 140, noExpiry: true } });
  mv('sugar', 'received', 2, 18, { batchKey: 'sugar', patch: { purchasePrice: 90, noExpiry: true } });
  mv('toor', 'received', 2, 15, { batchKey: 'toor', patch: { purchasePrice: 300, noExpiry: true } });
  mv('moong', 'received', 1.5, 15, { batchKey: 'moong', patch: { purchasePrice: 195, noExpiry: true } });
  mv('atta', 'received', 8, 12, { batchKey: 'atta', patch: { purchasePrice: 360, noExpiry: true } });
  // Purchase A (8 days ago): rice + sunflower oil restock.
  const purchaseA: Purchase = { id: uid('pur'), opId: uid('op'), householdId, total: 475, createdAt: isoDaysAgo(now, 8), userName: SHOWCASE_NAME, items: [
    { name: 'Basmati Rice', qty: 5, unit: 'kg', price: 325, category: 'Grains, rice and flour', itemId: item('rice').id },
    { name: 'Sunflower Oil', qty: 1, unit: 'l', price: 150, category: 'Oils, spices and condiments', itemId: item('sunOil').id },
  ] };
  mv('rice', 'purchased', 5, 8, { batchKey: 'rice-2', opId: purchaseA.opId, patch: { purchasePrice: 325, noExpiry: true } });
  mv('sunOil', 'purchased', 1, 8, { batchKey: 'oil-2', patch: { purchasePrice: 150, expiryDate: dateFrom(now, 150) } });
  for (let d = 8; d >= 1; d--) { mv('rice', 'consumed', 0.3, d, { reason: 'Daily cooking' }); mv('sunOil', 'consumed', 0.11, d, { reason: 'Daily cooking' }); }
  // A curd pack that expired and was thrown away (see the waste record below).
  mv('curd', 'received', 0.4, 5, { batchKey: 'curd-old', patch: { purchasePrice: 30, expiryDate: dateFrom(now, -4) } });
  mv('potato', 'received', 3, 4, { batchKey: 'potato', patch: { purchasePrice: 105, expiryDate: dateFrom(now, 10) } });
  mv('onion', 'received', 2.5, 4, { batchKey: 'onion', patch: { purchasePrice: 100, expiryDate: dateFrom(now, 12) } });
  mv('curd', 'discarded', 0.4, 3, { reason: 'Expired' });
  // Purchase B (2 days ago): fresh dairy + tomatoes.
  const purchaseB: Purchase = { id: uid('pur'), opId: uid('op'), householdId, total: 135, createdAt: isoDaysAgo(now, 2), userName: SHOWCASE_NAME, items: [
    { name: 'Milk', qty: 1, unit: 'l', price: 60, category: 'Dairy and refrigerated', itemId: item('milk').id },
    { name: 'Tomatoes', qty: 1, unit: 'kg', price: 40, category: 'Fruits and vegetables', itemId: item('tomato').id },
    { name: 'Curd', qty: 0.5, unit: 'kg', price: 35, category: 'Dairy and refrigerated', itemId: item('curd').id },
  ] };
  mv('milk', 'purchased', 1, 2, { batchKey: 'milk', opId: purchaseB.opId, patch: { purchasePrice: 60, expiryDate: dateFrom(now, 2) } });
  mv('tomato', 'purchased', 1, 2, { batchKey: 'tomato', patch: { purchasePrice: 40, expiryDate: dateFrom(now, 1) } });
  mv('curd', 'purchased', 0.5, 2, { batchKey: 'curd', patch: { purchasePrice: 35, expiryDate: dateFrom(now, 3) } });

  // Fold chronologically through the stock engine so batches + processedOps
  // are exactly what the app itself would have produced.
  movements.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let state = { batches: [] as Batch[], processedOps: [] as string[] };
  for (const m of movements) state = applyMovement(state, m, byId.get(m.itemId)!);
  const batches = state.batches.map(b => { const p = batchPatches.get(b.id); return p ? { ...b, ...p } : b; });

  // ---- lists, purchases, prices, waste, prefs ----
  const list: ShoppingList = { id: uid('list'), householdId, name: 'Weekly Shopping', createdAt: isoDaysAgo(now, 1) };
  const shopping: ShoppingItem[] = [
    { id: uid('shop'), householdId, listId: list.id, name: 'Basmati Rice', itemId: item('rice').id, qty: 5, unit: 'kg', expectedPrice: 325, priority: 'high', status: 'pending', createdAt: isoDaysAgo(now, 1) },
    { id: uid('shop'), householdId, listId: list.id, name: 'Eggs', qty: 12, unit: 'pcs', expectedPrice: 84, priority: 'medium', status: 'pending', createdAt: isoDaysAgo(now, 1) },
    { id: uid('shop'), householdId, listId: list.id, name: 'Bananas', qty: 1, unit: 'kg', expectedPrice: 60, priority: 'low', status: 'pending', createdAt: isoDaysAgo(now, 1) },
    { id: uid('shop'), householdId, listId: list.id, name: 'Whole Wheat Bread', qty: 1, unit: 'packet', expectedPrice: 45, priority: 'medium', status: 'pending', createdAt: isoDaysAgo(now, 1) },
  ];
  const prices: PricePoint[] = [
    { id: uid('price'), householdId, name: 'Basmati Rice', price: 600, qty: 10, unit: 'kg', date: dateFrom(now, -30) },
    { id: uid('price'), householdId, name: 'Basmati Rice', price: 325, qty: 5, unit: 'kg', date: dateFrom(now, -8) },
    { id: uid('price'), householdId, name: 'Sunflower Oil', price: 420, qty: 3, unit: 'l', date: dateFrom(now, -30) },
    { id: uid('price'), householdId, name: 'Sunflower Oil', price: 150, qty: 1, unit: 'l', date: dateFrom(now, -8) },
  ];
  const waste: Waste[] = [
    { id: uid('waste'), householdId, itemId: item('curd').id, name: 'Curd', qty: 0.4, unit: 'kg', date: dateFrom(now, -3), reason: 'Expired', estValue: 28 },
  ];

  return {
    user, household, member, items, batches, movements,
    lists: [list], shopping, purchases: [purchaseA, purchaseB], prices, waste,
    processedOps: state.processedOps,
    prefs: { currency: '₹', budgetMonthly: 8000, budgetPeriod: 'monthly' },
  };
}
