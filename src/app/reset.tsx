
import React, { useState } from 'react'; import { Alert, ScrollView } from 'react-native'; import { useStore } from '../data/store'; import { BackBtn, BrandHeader, Btn, Card, Input, Screen, SectionTitle, T } from '../components/ui';
export default function Reset(){ const s=useStore(); const [e,setE]=useState(''); const [busy,setBusy]=useState(false);
 const go=async()=>{ if(busy) return; setBusy(true); const msg=await s.resetPassword(e); setBusy(false); Alert.alert('Reset', msg); };
 return <Screen><ScrollView><BackBtn/><BrandHeader/><Card><SectionTitle>Reset password</SectionTitle><Input value={e} onChangeText={setE} placeholder="Email" autoCapitalize="none"/><Btn title={busy?'Sending…':'Request reset'} onPress={go}/><T sub>We email you a secure reset link from Firebase — the link works on any device.</T></Card></ScrollView></Screen>; }
