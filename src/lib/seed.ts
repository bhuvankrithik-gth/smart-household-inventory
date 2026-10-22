import { DB, defaultPrefs } from './types';
import { hashPassword } from './logic';
const d=(daysAgo:number)=>{ const t=new Date(); t.setDate(t.getDate()-daysAgo); return t.toISOString(); };
const df=(daysAgo:number)=>d(daysAgo).slice(0,10);
const exp=(inDays:number)=>{ const t=new Date(); t.setDate(t.getDate()+inDays); return t.toISOString().slice(0,10); };
export function demoDB():DB{
  const user={ id:'demo-user', name:'Demo User', email:'demo@local', passwordHash:hashPassword('demo1234'), createdAt:d(30), termsAcceptedAt:d(30), termsVersion:'1.0' };
  const hh={ id:'demo-household', name:'Demo Home (sample data)', ownerId:user.id, inviteCode:'DEMO42', createdAt:d(30), demo:true };
  const defs:[string,string,string,any,number,number,string,number|null,number][]=[
    // name, category, location, unit, qty, min, brand, expiryInDays, price
    ['Rice','Grains, rice and flour','Pantry','kg',3,2,'India Gate',90,320],
    ['Atta (Whole Wheat Flour)','Grains, rice and flour','Pantry','kg',4,2,'Aashirvaad',60,240],
    ['Toor Dal','Pulses and legumes','Pantry','kg',1.5,1,'Tata Sampann',120,210],
    ['Moong Dal','Pulses and legumes','Pantry','g',800,500,'Tata Sampann',120,120],
    ['Sunflower Oil','Oils, spices and condiments','Kitchen','l',0.6,1,'Fortune',180,140],
    ['Turmeric Powder','Oils, spices and condiments','Kitchen','g',180,100,'MDH',240,45],
    ['Red Chilli Powder','Oils, spices and condiments','Kitchen','g',150,100,'MDH',240,50],
    ['Milk','Dairy and refrigerated','Fridge','ml',500,500,'Amul',2,33],
    ['Curd','Dairy and refrigerated','Fridge','g',400,200,'Amul',3,35],
    ['Potato','Fruits and vegetables','Kitchen','pcs',6,4,'',10,60],
    ['Onion','Fruits and vegetables','Kitchen','pcs',8,4,'',12,70],
    ['Tomato','Fruits and vegetables','Fridge','pcs',4,4,'',3,50],
    ['Carrot','Fruits and vegetables','Fridge','pcs',3,2,'',5,40],
    ['Biscuits','Snacks and packaged foods','Pantry','packet',2,2,'Parle-G',60,20],
    ['Dishwash Gel','Cleaning supplies','Kitchen','bottle',1,1,'Vim',null,99],
    ['Floor Cleaner','Cleaning supplies','Store room','l',1,1,'Lizol',null,180],
    ['Toothpaste','Toiletries and personal care','Bathroom','pcs',2,1,'Colgate',null,95],
    ['Shampoo','Toiletries and personal care','Bathroom','bottle',1,1,'',null,150],
  ];
  const items=defs.map((x,i)=>({ id:`demo-item-${i}`, householdId:hh.id, name:x[0], category:x[1], location:x[2], unit:x[3], minQty:x[5], brand:x[6], archived:false, createdAt:d(25), updatedAt:d(1), createdBy:'Demo User' }));
  const batches=defs.map((x,i)=>({ id:`demo-batch-${i}`, householdId:hh.id, itemId:`demo-item-${i}`, qty:x[4], unit:x[3], purchasePrice:x[8], purchaseDate:df(10), expiryDate:x[7]===null?undefined:exp(x[7]), noExpiry:x[7]===null, location:x[2], createdAt:d(10) }));
  const movements:any[]=[];
  // 30 days of rice + oil consumption so run-out prediction has real history
  for(let day=28; day>=1; day-=2){ movements.push({ id:`demo-mv-rice-${day}`, opId:`demo-op-rice-${day}`, householdId:hh.id, itemId:'demo-item-0', type:'consumed', qty:0.25, unit:'kg', reason:'Daily cooking', userId:user.id, userName:'Demo User', createdAt:d(day) }); }
  for(let day=27; day>=1; day-=3){ movements.push({ id:`demo-mv-oil-${day}`, opId:`demo-op-oil-${day}`, householdId:hh.id, itemId:'demo-item-4', type:'consumed', qty:0.05, unit:'l', reason:'Cooking', userId:user.id, userName:'Demo User', createdAt:d(day) }); }
  movements.push({ id:'demo-mv-waste-1', opId:'demo-op-waste-1', householdId:hh.id, itemId:'demo-item-11', type:'discarded', qty:2, unit:'pcs', reason:'Spoiled', userId:user.id, userName:'Demo User', createdAt:d(4) });
  return {
    users:[user], currentUserId:user.id, households:[hh], currentHouseholdId:hh.id,
    members:[{ id:'demo-member', householdId:hh.id, userId:user.id, name:user.name, email:user.email, role:'owner', joinedAt:d(30) }],
    items, batches, movements,
    lists:[{ id:'demo-list', householdId:hh.id, name:'Weekly Shopping', createdAt:d(2) }],
    shopping:[
      { id:'demo-shop-1', householdId:hh.id, listId:'demo-list', name:'Sunflower Oil', itemId:'demo-item-4', qty:1, unit:'l', expectedPrice:145, priority:'high', status:'pending', createdAt:d(1) },
      { id:'demo-shop-2', householdId:hh.id, listId:'demo-list', name:'Milk', itemId:'demo-item-7', qty:1, unit:'l', expectedPrice:66, priority:'medium', status:'pending', createdAt:d(1) },
    ],
    purchases:[
      { id:'demo-pur-1', opId:'demo-op-pur-1', householdId:hh.id, total:685, createdAt:d(20), userName:'Demo User', items:[{name:'Rice',qty:5,unit:'kg',price:320,category:'Grains, rice and flour'},{name:'Toor Dal',qty:2,unit:'kg',price:210,category:'Pulses and legumes'},{name:'Sunflower Oil',qty:1,unit:'l',price:155,category:'Oils, spices and condiments'}] },
      { id:'demo-pur-2', opId:'demo-op-pur-2', householdId:hh.id, total:430, createdAt:d(6), userName:'Demo User', items:[{name:'Atta (Whole Wheat Flour)',qty:5,unit:'kg',price:240,category:'Grains, rice and flour'},{name:'Milk',qty:2,unit:'l',price:120,category:'Dairy and refrigerated'},{name:'Tomato',qty:1,unit:'kg',price:70,category:'Fruits and vegetables'}] },
    ],
    waste:[{ id:'demo-waste-1', householdId:hh.id, itemId:'demo-item-11', name:'Tomato', qty:2, unit:'pcs', date:df(4), reason:'Spoiled before use', estValue:25 }],
    prices:defs.map((x,i)=>({ id:`demo-price-${i}`, householdId:hh.id, name:x[0], price:x[8], qty:x[4], unit:x[3], date:df(10) })),
    processedOps:movements.map(m=>m.opId).concat(['demo-op-pur-1','demo-op-pur-2']),
    prefs:{...defaultPrefs}, demoLoaded:true, pendingOps:[], audit:[{id:'demo-audit', text:'Demo household loaded (sample data, removable in Profile)', at:d(0)}],
  };
}
export function emptyDB():DB{ return { users:[], households:[], members:[], items:[], batches:[], movements:[], lists:[], shopping:[], purchases:[], waste:[], prices:[], processedOps:[], prefs:{...defaultPrefs}, demoLoaded:false, pendingOps:[], audit:[] }; }
