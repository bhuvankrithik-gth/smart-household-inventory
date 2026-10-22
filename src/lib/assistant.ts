import { Batch, Item, Movement, Prefs, Purchase } from './types';
import { expiryStatus, fmtMoney, isLowStock, itemQty, monthSpend, predictRunOut, replenishment } from './logic';
export interface Snapshot { items:Item[]; batches:Batch[]; movements:Movement[]; purchases:Purchase[]; prefs:Prefs }
export function assistantAnswer(q:string, s:Snapshot, now=new Date()):string{
  const text=q.toLowerCase();
  if(/expir/.test(text)){ const list=s.batches.map(b=>({b, st:expiryStatus(b,now,s.prefs.expiryWarnDays), item:s.items.find(i=>i.id===b.itemId)})).filter(x=>x.st==='expired'||x.st==='expiring'); if(!list.length) return 'Nothing is expired or expiring soon in your recorded inventory.'; return 'Expiring / expired: '+list.map(x=>`${x.item?.name||'Item'} (${x.b.qty} ${x.b.unit}, ${x.st}, expiry ${x.b.expiryDate||'unknown'})`).join('; ')+'.'; }
  if(/spent|spend|budget/.test(text)){ const spent=monthSpend(s.purchases,now); return `You have recorded ${fmtMoney(spent, s.prefs.currency)} of spending this month. Your ${s.prefs.budgetPeriod} budget is ${fmtMoney(s.prefs.budgetMonthly, s.prefs.currency)}, so ${fmtMoney(s.prefs.budgetMonthly-spent, s.prefs.currency)} remains (based only on recorded purchases).`; }
  if(/buy|shopping|need/.test(text)){ const recs=s.items.filter(i=>!i.archived).map(i=>({i, r:replenishment(i,s.batches,s.movements,now)})).filter(x=>x.r.needsBuy); if(!recs.length) return 'Based on your recorded stock and usage, nothing urgently needs buying right now.'; return 'Suggested to buy: '+recs.map(x=>`${x.i.name} — buy about ${x.r.suggestedQty} ${x.i.unit}. Reason: ${x.r.reason}`).join(' '); }
  const riceLike = s.items.find(i=> text.includes(i.name.toLowerCase().split(' ')[0]) && i.name.length>2);
  // generic item sufficiency: "do I have enough X for N days"
  const m=text.match(/enough (.+?) for/); const daysMatch=text.match(/(\d+)\s*day/);
  const targetName = m? m[1].trim() : (riceLike? riceLike.name.toLowerCase(): null);
  if(targetName){ const item=s.items.find(i=>i.name.toLowerCase().includes(targetName)||targetName.includes(i.name.toLowerCase())); if(!item) return `I could not find "${targetName}" in your recorded inventory, so I cannot answer from your data.`; const qty=itemQty(item,s.batches); const pred=predictRunOut(item,s.batches,s.movements,now); const days=daysMatch?parseInt(daysMatch[1]):3; if(pred.days===null) return `You have ${qty} ${item.unit} of ${item.name}. ${pred.reason}`; return `You have ${qty} ${item.unit} of ${item.name}. At ~${pred.dailyRate} ${item.unit}/day it should last about ${pred.days} days, so ${pred.days>=days?`yes, that covers ${days} days`:`no, it may not cover ${days} days`}. ${pred.reason}`; }
  if(/recipe|cook/.test(text)){ return 'Open the Recipes section — it ranks recipes from your actual inventory and prioritises ingredients expiring soon, and lists anything missing honestly.'; }
  if(/low/.test(text)){ const low=s.items.filter(i=>isLowStock(i,s.batches)); return low.length? 'Low stock: '+low.map(i=>`${i.name} (${itemQty(i,s.batches)} ${i.unit}, minimum ${i.minQty})`).join('; ') : 'Nothing is at or below its minimum stock level right now.'; }
  return 'I can answer from your real data about: expiring items, low stock, what to buy, this month\'s spending, whether you have enough of an item for N days, and recipes. Try: "What is expiring soon?" or "Do I have enough rice for the next 3 days?"';
}
export interface ProposedAction { kind:'add-shopping'|'consume'; name:string; qty:number; unit:string; raw:string }
export function parseProposedAction(text:string):ProposedAction|null{
  const add=text.match(/add\s+(\d+(?:\.\d+)?)?\s*(kg|g|l|ml|pcs|packets?|boxes)?\s*(?:of\s+)?(.+)/i);
  if(add){ return { kind:'add-shopping', qty: add[1]?parseFloat(add[1]):1, unit:(add[2]||'pcs').replace(/s$/,''), name:add[3].trim(), raw:text }; }
  const used=text.match(/(?:used|consumed|use)\s+(\d+(?:\.\d+)?)\s*(kg|g|l|ml|pcs)?\s*(?:of\s+)?(.+)/i);
  if(used){ return { kind:'consume', qty:parseFloat(used[1]), unit:used[2]||'pcs', name:used[3].trim(), raw:text }; }
  return null;
}
