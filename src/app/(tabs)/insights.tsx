
import React from 'react'; import { ScrollView } from 'react-native'; import { useStore } from '../../data/store'; import { Bars, Card, H, NoHousehold, Screen, T } from '../../components/ui'; import { budgetSummary, fmtMoney, monthlySpendSeries, pricePerUnit, spendByCategory, wasteSummary } from '../../lib/logic';
export default function Insights(){ const s=useStore(); const b=budgetSummary(s.hhPurchases,s.db.prefs); const w=wasteSummary(s.hhWaste); const freq:Record<string,number>={}; s.hhPurchases.forEach(p=>p.items.forEach(i=>freq[i.name]=(freq[i.name]||0)+1)); const topFreq=Object.entries(freq).sort((a,b2)=>b2[1]-a[1]).slice(0,5);
 return <Screen><ScrollView><H>Insights (real records only)</H>{!s.household?<NoHousehold/>:null}
 <Card><T sub>Budget features are a personal record-keeping aid, not financial advice.</T></Card><Card><H>Budget</H><T>Spent this period: {fmtMoney(b.spent,s.db.prefs.currency)} of {fmtMoney(b.budget,s.db.prefs.currency)} ({b.pct}%) · Remaining {fmtMoney(b.remaining,s.db.prefs.currency)}{b.over?' — OVER BUDGET':''}</T></Card>
 <Card><H>Monthly spending</H><Bars data={monthlySpendSeries(s.hhPurchases)} currency={s.db.prefs.currency}/></Card>
 <Card><H>Spending by category</H><Bars data={spendByCategory(s.hhPurchases)} currency={s.db.prefs.currency}/></Card>
 <Card><H>Frequently purchased</H>{topFreq.map(([n,c])=><T key={n}>• {n} — {c} time(s)</T>)}{!topFreq.length?<T sub>No purchases recorded yet.</T>:null}</Card>
 <Card><H>Price history (latest, per unit)</H>{[...s.db.prices].filter(p=>p.householdId===s.household?.id).slice(-8).reverse().map(p=>{ const u=pricePerUnit(p.price,p.qty,p.unit as any); return <T key={p.id} sub>{p.date} — {p.name}: {fmtMoney(p.price,s.db.prefs.currency)} ({fmtMoney(u.per,s.db.prefs.currency)}/{u.base})</T>; })}</Card>
 <Card><H>Waste & SDG 12</H><T>Recorded waste: {w.count} record(s), est. value {fmtMoney(w.value,s.db.prefs.currency)}{w.topItem?`, most wasted: ${w.topItem}`:''}</T><T sub>SDG 12 (Responsible Consumption & Production): tracking expiry, waste reasons and run-out predictions helps households buy only what they will use.</T></Card>
 </ScrollView></Screen>; }
