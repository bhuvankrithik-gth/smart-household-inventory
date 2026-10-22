import { Batch, Item, Movement, Prefs, Purchase, ShoppingItem, Unit, Waste } from './types';
// ---------- units ----------
const FAMILY: Record<Unit,string> = { g:'mass', kg:'mass', ml:'volume', l:'volume', pcs:'count', packet:'count', box:'count', bottle:'count' };
const TO_CANON: Record<Unit,number> = { g:1, kg:1000, ml:1, l:1000, pcs:1, packet:1, box:1, bottle:1 };
export function unitFamily(u:Unit){ return FAMILY[u]; }
export function toCanonical(qty:number, unit:Unit){ return qty * TO_CANON[unit]; }
export function fromCanonical(v:number, unit:Unit){ return v / TO_CANON[unit]; }
export function convert(qty:number, from:Unit, to:Unit){ if(FAMILY[from]!==FAMILY[to]) throw new Error(`Cannot convert ${from} to ${to}`); return fromCanonical(toCanonical(qty,from), to); }
export function pricePerUnit(price:number, qty:number, unit:Unit){ if(qty<=0) return { per:0, base:'unit' }; const c=toCanonical(qty,unit); const base = FAMILY[unit]==='mass'?'kg':FAMILY[unit]==='volume'?'l':'unit'; const per = base==='kg'||base==='l' ? price/(c/1000) : price/c; return { per: Math.round(per*100)/100, base }; }
// ---------- stock ----------
export function itemQty(item:Item, batches:Batch[]){ return batches.filter(b=>b.itemId===item.id && !item.archived).reduce((s,b)=> s + convert(b.qty, b.unit, item.unit), 0); }
export function totalQty(batches:Batch[], item:Item){ return itemQty(item,batches); }
export function isLowStock(item:Item, batches:Batch[]){ const q=itemQty(item,batches); return q>0 && q<=item.minQty; }
export function isOutOfStock(item:Item, batches:Batch[]){ return itemQty(item,batches)<=0; }
export type ExpiryStatus='expired'|'expiring'|'ok'|'no-date'|'no-expiry';
export function expiryStatus(b:Batch, now=new Date(), warnDays=7):ExpiryStatus{ if(b.noExpiry) return 'no-expiry'; if(!b.expiryDate) return 'no-date'; const d=(new Date(b.expiryDate).getTime()-now.getTime())/86400000; if(d<0) return 'expired'; if(d<=warnDays) return 'expiring'; return 'ok'; }
export function daysToExpiry(b:Batch, now=new Date()){ if(!b.expiryDate) return null; return Math.ceil((new Date(b.expiryDate).getTime()-now.getTime())/86400000); }
// ---------- pure idempotent stock engine ----------
export interface StockState { batches:Batch[]; processedOps:string[] }
export function applyMovement(state:StockState, m:Movement, item:Item):StockState{
  if(state.processedOps.includes(m.opId)) return state; // idempotent: duplicate op never applies twice
  const batches = state.batches.map(b=>({...b}));
  const sign = (m.type==='received'||m.type==='purchased'||m.type==='corrected') ? 1 : -1;
  const deltaQty = m.qty; // in item unit for simplicity of engine; batches store item unit
  if(sign<0){
    let remaining = deltaQty;
    // consume earliest-expiry first (FIFO by expiry)
    const sorted=[...batches.filter(b=>b.itemId===m.itemId)].sort((a,b)=>(a.expiryDate||'9999').localeCompare(b.expiryDate||'9999'));
    const available = sorted.reduce((s,b)=>s+b.qty,0);
    if(available + 1e-9 < deltaQty) throw new Error('Insufficient stock: quantity would go negative');
    for(const sb of sorted){ if(remaining<=0) break; const take=Math.min(sb.qty, remaining); const t=batches.find(b=>b.id===sb.id)!; t.qty=Math.round((t.qty-take)*1000)/1000; remaining-=take; }
  } else {
    const existing = batches.find(b=>b.itemId===m.itemId && b.expiryDate===undefined);
    if(existing && m.batchId===undefined){ existing.qty=Math.round((existing.qty+deltaQty)*1000)/1000; }
    else batches.push({ id:m.batchId||('batch-'+m.opId), householdId:m.householdId, itemId:m.itemId, qty:deltaQty, unit:item.unit, purchaseDate:m.createdAt.slice(0,10), location:item.location, createdAt:m.createdAt });
  }
  return { batches: batches.filter(b=>b.qty>0 || sign>0), processedOps:[...state.processedOps, m.opId] };
}
// ---------- prediction ----------
export interface Prediction { days:number|null; dailyRate:number; confidence:'high'|'medium'|'low'|'insufficient'; reason:string }
export function predictRunOut(item:Item, batches:Batch[], movements:Movement[], now=new Date()):Prediction{
  const qty=itemQty(item,batches);
  const windowDays=30; const since=now.getTime()-windowDays*86400000;
  const consumed=movements.filter(m=>m.itemId===item.id && m.type==='consumed' && new Date(m.createdAt).getTime()>=since);
  const total=consumed.reduce((s,m)=>s+convert(m.qty,m.unit,item.unit),0);
  const distinctDays=new Set(consumed.map(m=>m.createdAt.slice(0,10))).size;
  if(total<=0 || distinctDays<2) return { days:null, dailyRate:0, confidence:'insufficient', reason:'Not enough consumption history yet — record usage for a few days and predictions will appear.' };
  const dailyRate=total/windowDays;
  const days=Math.floor(qty/dailyRate);
  const confidence = distinctDays>=10?'high':distinctDays>=5?'medium':'low';
  return { days, dailyRate:Math.round(dailyRate*100)/100, confidence, reason:`Based on ${total} ${item.unit} used over the last 30 days (~${(Math.round(dailyRate*100)/100)} ${item.unit}/day) and ${qty} ${item.unit} in stock.` };
}
export function replenishment(item:Item, batches:Batch[], movements:Movement[], now=new Date()){
  const qty=itemQty(item,batches); const pred=predictRunOut(item,batches,movements,now);
  const target=Math.max(item.minQty*2, pred.dailyRate>0? pred.dailyRate*14 : item.minQty*2);
  const suggested=Math.max(0, Math.ceil(target-qty));
  const reasons:string[]=[];
  if(qty<=item.minQty) reasons.push(`${item.name} is at/below your minimum of ${item.minQty} ${item.unit}`);
  if(pred.days!==null && pred.days<=7) reasons.push(`recent usage suggests it may run out in ~${pred.days} day(s)`);
  if(!reasons.length) reasons.push('Stock looks healthy for now');
  return { suggestedQty:suggested, reason: reasons.join('; ') + '.', needsBuy: suggested>0 && (qty<=item.minQty || (pred.days!==null && pred.days<=14)) };
}
// ---------- duplicates ----------
export function normalizeName(s:string){ return s.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim(); }
export function findDuplicate(name:string, candidates:string[]){ const n=normalizeName(name); if(!n) return null; for(const c of candidates){ const cn=normalizeName(c); if(cn===n || cn.includes(n) || n.includes(cn)) return c; const tokens=n.split(' '); if(tokens.length && cn.split(' ').some(t=>tokens.includes(t) && t.length>3)) return c; } return null; }
// ---------- shopping / budget / waste ----------
export function shoppingTotals(items:ShoppingItem[]){ const est=items.filter(i=>i.status!=='cancelled').reduce((s,i)=>s+(i.expectedPrice||0)*1,0); const actual=items.filter(i=>i.status==='purchased').reduce((s,i)=>s+(i.actualPrice||0),0); return { estimated:Math.round(est*100)/100, actual:Math.round(actual*100)/100, pending:items.filter(i=>i.status==='pending').length }; }
export function monthSpend(purchases:Purchase[], now=new Date()){ const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; return purchases.filter(p=>p.createdAt.startsWith(ym)).reduce((s,p)=>s+p.total,0); }
export function budgetSummary(purchases:Purchase[], prefs:Prefs, now=new Date()){ const spent=monthSpend(purchases,now); const budget=prefs.budgetPeriod==='weekly'? prefs.budgetMonthly/4.33 : prefs.budgetMonthly; const remaining=Math.round((budget-spent)*100)/100; return { spent, budget, remaining, pct: budget>0? Math.round(spent/budget*100):0, over: remaining<0 }; }
export function spendByCategory(purchases:Purchase[]){ const map:Record<string,number>={}; purchases.forEach(p=>p.items.forEach(i=>{ const c=i.category||'Other'; map[c]=(map[c]||0)+i.price; })); return Object.entries(map).map(([label,value])=>({label,value:Math.round(value*100)/100})).sort((a,b)=>b.value-a.value); }
export function monthlySpendSeries(purchases:Purchase[], months=6, now=new Date()){ const out:{label:string;value:number}[]=[]; for(let i=months-1;i>=0;i--){ const d=new Date(now.getFullYear(), now.getMonth()-i, 1); const ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; out.push({ label:d.toLocaleString('en-IN',{month:'short'}), value: purchases.filter(p=>p.createdAt.startsWith(ym)).reduce((s,p)=>s+p.total,0) }); } return out; }
export function wasteSummary(records:Waste[]){ const value=records.reduce((s,w)=>s+(w.estValue||0),0); const freq:Record<string,number>={}; records.forEach(w=>freq[w.name]=(freq[w.name]||0)+1); const top=Object.entries(freq).sort((a,b)=>b[1]-a[1])[0]; return { count:records.length, value:Math.round(value*100)/100, topItem: top?top[0]:null }; }
export function hashPassword(pw:string){ let h1=5381,h2=52711; for(let i=0;i<pw.length;i++){ const c=pw.charCodeAt(i); h1=(h1*33)^c; h2=(h2*31)^c; } return `local-${(h1>>>0).toString(16)}-${(h2>>>0).toString(16)}`; }
export function uid(p='id'){ return `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`; }
export function fmtMoney(v:number, sym='₹'){ return `${sym}${v.toLocaleString('en-IN',{maximumFractionDigits:2})}`; }
