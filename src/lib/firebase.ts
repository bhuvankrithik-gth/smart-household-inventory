import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
// Firebase client config is PUBLIC (identifies the project; security is enforced by
// Firestore rules + Firebase Auth, NOT by hiding these values). No service-account key exists in the app.
const extra: any = (Constants as any).expoConfig?.extra?.firebase || {};
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
// getReactNativePersistence ships in the React Native build of firebase/auth
// (Metro resolves it at runtime); it is not part of the shared TS typings,
// so it is pulled off the namespace defensively.
const getReactNativePersistence = (FirebaseAuth as any).getReactNativePersistence as
  ((storage: typeof AsyncStorage) => FirebaseAuth.Persistence) | undefined;
const { initializeAuth, getAuth } = FirebaseAuth;
let app: FirebaseApp | undefined; let auth: FirebaseAuth.Auth | undefined; let db: Firestore | undefined;
if (firebaseConfigured) {
  try {
    app = getApps().length ? getApps()[0] : initializeApp(cfg);
    try {
      // Native: persist the session in AsyncStorage so logins survive restarts.
      // Web: default (browser) persistence.
      auth = Platform.OS !== 'web' && getReactNativePersistence
        ? initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
        : getAuth(app);
    } catch { auth = getAuth(app); }
    db = getFirestore(app);
  } catch { /* auth/db stay undefined; the store surfaces a clear not-configured state */ }
}
export { app as firebaseApp, auth as firebaseAuth, db as firestoreDb };
// Firestore data map (v2.0, see docs/ARCHITECTURE.md):
// profiles/{uid}; households/{hid} {name, ownerId, memberIds[], inviteCode, monthlyBudget?, currency?, processedOps[]}
// + households/{hid}/members/{uid}; inviteCodes/{CODE} {householdId};
// household-scoped top-level collections (every doc carries householdId):
// inventoryItems, batches, stockMovements, shoppingLists, shoppingListItems,
// purchases, priceHistory, wasteRecords. Access is enforced by firestore.rules.
export function friendlyAuthError(e: any): string {
  const code = String(e?.code || '');
  if (code.includes('email-already-in-use')) return 'An account with this email already exists. Try logging in instead.';
  if (code.includes('weak-password')) return 'Password is too weak — use at least 6 characters.';
  if (code.includes('invalid-email')) return 'That email address looks invalid.';
  if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')) return 'Wrong email or password. Check your details and try again, or create an account instead.';
  if (code.includes('too-many-requests')) return 'Too many attempts — please wait a bit and try again.';
  if (code.includes('network-request-failed')) return 'Network problem — check your connection and try again.';
  if (code.includes('requires-recent-login')) return 'For security, please log out, log back in, and then try again.';
  return 'Something went wrong. Please try again.';
}
export function isOfflineError(e: any): boolean {
  const code = String(e?.code || '');
  return code.includes('unavailable') || code.includes('network-request-failed') || code.includes('deadline-exceeded');
}
