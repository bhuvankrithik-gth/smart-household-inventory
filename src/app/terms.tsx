
import React from 'react'; import { ScrollView } from 'react-native'; import { BackBtn, Card, H, Screen, T } from '../components/ui';
export const TERMS_TEXT = `Terms of Service — Version 1.0 · Last updated: 22 October 2026

1. Who can use the app: You must be 18 or older, or use the app with the consent and supervision of a parent or legal guardian.
2. What the app does: Smart Household Inventory helps you track household items, quantities, expiry dates, shopping lists, purchases, budgets and waste that YOU enter. Predictions are transparent rule-based estimates from your records — not guarantees.
3. Your content: You own the household data you enter. You grant the app only the permission needed to store and display it to you and to household members you invite.
4. Household sharing: Anything you add to a shared household is visible to its members. Only invite people you trust. The owner may remove members.
5. Acceptable use: Do not use the app unlawfully, to infringe others' rights, or to attempt to access another household's data.
6. FOOD SAFETY DISCLAIMER: Expiry and best-before dates in the app are dates YOU entered, shown as guidance only. The app never guarantees that any food is safe to eat. Check food yourself; when in doubt, throw it out. The app's authors are not liable for decisions you make about consuming food.
7. BUDGET DISCLAIMER: Budget and price features are a personal record-keeping aid, not financial, investment or professional advice.
8. Availability: The app is provided "as is". Your account and household data live in the cloud (Firebase, Google); the app keeps a working copy on your device so you can view and record while offline, and changes upload when you reconnect. Cloud features depend on Firebase availability and on the supplied Firestore security rules being published.
9. Liability: To the maximum extent permitted by Indian law, liability is limited to direct losses caused by the app's proven fault. Nothing in these terms removes rights you have under the Consumer Protection Act, 2019 or the DPDP Act, 2023.
10. Changes: If these terms change materially, the version number and date above will change and registration acceptance will be re-requested for new accounts.
11. Governing law: India.
© 2026 Smart Household Inventory / app owner. All rights reserved.`;
export default function Terms(){ return <Screen><ScrollView><BackBtn/><H>Terms of Service</H><Card><T>{TERMS_TEXT}</T></Card></ScrollView></Screen>; }
