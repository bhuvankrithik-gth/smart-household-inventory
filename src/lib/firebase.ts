import Constants from 'expo-constants';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore, collection, getDocs } from 'firebase/firestore';
// Firebase client config is PUBLIC (identifies the project; security is enforced by
// Firestore rules + Firebase Auth, NOT by hiding these values). No service-account key exists in the app.
const extra:any = (Constants as any).expoConfig?.extra?.firebase || {};
const cfg = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || extra.apiKey || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || extra.authDomain || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || extra.projectId || '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || extra.storageBucket || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || extra.messagingSenderId || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || extra.appId || '',
};
export const firebaseConfigured = Boolean(cfg.apiKey && cfg.projectId && cfg.appId);
export const firebaseConfig = cfg;
let app:FirebaseApp|undefined; let auth:Auth|undefined; let db:Firestore|undefined;
if(firebaseConfigured){ try{ app = getApps().length? getApps()[0] : initializeApp(cfg); auth = getAuth(app); db = getFirestore(app); }catch{ /* local mode continues */ } }
export { app as firebaseApp, auth as firebaseAuth, db as firestoreDb };
// Firestore collection map (NoSQL, household isolation via firestore.rules):
// households/{id}, households/{id}/members/{uid}, inventoryItems, batches, stockMovements,
// shoppingLists, shoppingListItems, purchases, purchaseItems, priceHistory, wasteRecords,
// notifications, householdGoals, auditEvents — every doc carries householdId + member check in rules.
export type CloudStatus = 'not-configured'|'ok'|'permission-denied'|'error';
export async function probeCloud():Promise<{status:CloudStatus; message:string}>{
  if(!firebaseConfigured || !db) return { status:'not-configured', message:'Firebase is not configured in this build. Local mode is fully working.' };
  try{ await getDocs(collection(db,'households')); return { status:'ok', message:'Firestore reachable and rules allow this read.' }; }
  catch(e:any){ const code=e?.code||''; if(code.includes('permission-denied')) return { status:'permission-denied', message:'Cloud rules not yet published (or you are not a member). Firestore is still in production deny-all mode — publish firestore.rules from this repo in Firebase Console > Firestore > Rules > Publish. Local mode keeps working.' }; return { status:'error', message:`Firestore check failed (${code||'unknown'}). Local mode keeps working.` }; }
}
