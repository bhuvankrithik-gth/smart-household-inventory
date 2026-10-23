
import React from 'react'; import { ScrollView } from 'react-native'; import { Card, H, Screen, T } from '../components/ui';
export const PRIVACY_TEXT = `Privacy Policy — Version 1.0 · Last updated: 22 October 2026

WHAT WE COLLECT
• Account: your name and email address, and a password (stored hashed locally, or handled by Firebase Auth in cloud mode — we never store plain passwords).
• Household content you create: inventory items, batches, quantities, purchase prices and dates, shopping lists, waste records, preferences.
• Photos only if YOU choose a receipt image; it is processed only as described in the receipt screen and is never sold.
• No advertising trackers. No sale of personal data. Ever.

WHY: solely to run the inventory, shopping, prediction, budget and sharing features you use.

WHO SEES IT: only you and household members you invite. Processing/storage is provided by Firebase (Google); a working copy is kept on your device so the app opens with your data while offline.

RETENTION & DELETION: Data is kept until you delete it. In Profile you can export all data (JSON), delete your household's data, or delete your account entirely. Account deletion removes the households you own, your memberships elsewhere, your profile, and your Firebase Auth user. Consent can be withdrawn by deleting your account/data.

YOUR RIGHTS (DPDP Act, 2023 & IT Act): access, correction, erasure, and grievance redressal. Use export/edit/delete in the app, or contact the grievance contact below.

SECURITY: data in transit to Firebase is encrypted (TLS); access between households is enforced by Firestore security rules and by household isolation in the local store. No system is perfectly secure — keep your device and password safe.

CHILDREN: The app is for users 18+, or younger users with parent/guardian consent (see Terms).

GRIEVANCE CONTACT: [APP OWNER — fill in your own contact email here before public launch. In the app this defaults to the account email of the app owner; no address is hardcoded.] Contact via Profile > Legal > Privacy if you have a privacy grievance; we aim to respond within a reasonable time.

CHANGES: Material changes update the version/date above.
© 2026 Smart Household Inventory / app owner.`;
export default function Privacy(){ return <Screen><ScrollView><H>Privacy Policy</H><Card><T>{PRIVACY_TEXT}</T></Card></ScrollView></Screen>; }
