export type Unit = 'g'|'kg'|'ml'|'l'|'pcs'|'packet'|'box'|'bottle';
export type MovementType = 'received'|'consumed'|'discarded'|'transferred'|'corrected'|'purchased';
export interface User { id:string; name:string; email:string; passwordHash:string; createdAt:string; termsAcceptedAt?:string; termsVersion?:string }
export interface Household { id:string; name:string; ownerId:string; inviteCode:string; createdAt:string; demo?:boolean }
export interface Member { id:string; householdId:string; userId:string; name:string; email:string; role:'owner'|'member'; joinedAt:string }
export interface Category { id:string; name:string }
export const CATEGORIES = ['Grains, rice and flour','Pulses and legumes','Fruits and vegetables','Dairy and refrigerated','Snacks and packaged foods','Oils, spices and condiments','Cleaning supplies','Toiletries and personal care','Other household essentials'];
export const LOCATIONS = ['Kitchen','Pantry','Fridge','Freezer','Store room','Bathroom','Other'];
export interface Item { id:string; householdId:string; name:string; category:string; subcategory?:string; brand?:string; barcode?:string; unit:Unit; minQty:number; location:string; notes?:string; image?:string; archived:boolean; createdAt:string; updatedAt:string; createdBy:string }
export interface Batch { id:string; householdId:string; itemId:string; qty:number; unit:Unit; purchasePrice?:number; purchaseDate?:string; expiryDate?:string; noExpiry?:boolean; location:string; createdAt:string }
export interface Movement { id:string; opId:string; householdId:string; itemId:string; batchId?:string; type:MovementType; qty:number; unit:Unit; reason?:string; userId:string; userName:string; createdAt:string; fromLocation?:string; toLocation?:string }
export interface ShoppingList { id:string; householdId:string; name:string; createdAt:string }
export interface ShoppingItem { id:string; householdId:string; listId:string; name:string; itemId?:string; qty:number; unit:Unit; expectedPrice?:number; actualPrice?:number; actualQty?:number; priority:'low'|'medium'|'high'; notes?:string; status:'pending'|'purchased'|'cancelled'; purchaseOpId?:string; createdAt:string }
export interface Purchase { id:string; opId:string; householdId:string; total:number; createdAt:string; userName:string; items:{name:string; qty:number; unit:Unit; price:number; category?:string; itemId?:string}[] }
export interface Waste { id:string; householdId:string; itemId?:string; name:string; qty:number; unit:Unit; date:string; reason:string; estValue?:number; notes?:string }
export interface PricePoint { id:string; householdId:string; name:string; price:number; qty:number; unit:Unit; date:string }
export interface Prefs { currency:string; budgetMonthly:number; budgetPeriod:'monthly'|'weekly'; expiryWarnDays:number; theme:'system'|'light'|'dark'; notifyLowStock:boolean; notifyExpiry:boolean; quietHours:string; wasteGoalPct:number }
export interface DB { users:User[]; currentUserId?:string; households:Household[]; members:Member[]; currentHouseholdId?:string; items:Item[]; batches:Batch[]; movements:Movement[]; lists:ShoppingList[]; shopping:ShoppingItem[]; purchases:Purchase[]; waste:Waste[]; prices:PricePoint[]; processedOps:string[]; prefs:Prefs; demoLoaded:boolean; pendingOps:{opId:string; kind:string; createdAt:string; synced:boolean}[]; audit:{id:string; text:string; at:string}[] }
export const defaultPrefs:Prefs = { currency:'₹', budgetMonthly:15000, budgetPeriod:'monthly', expiryWarnDays:7, theme:'system', notifyLowStock:true, notifyExpiry:true, quietHours:'22:00-07:00', wasteGoalPct:20 };
