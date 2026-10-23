
import React, { useState } from 'react'; import { Alert } from 'react-native'; import { useStore } from '../data/store'; import { Btn, Card, H, Input, Screen, T } from '../components/ui';
export default function Reset(){ const s=useStore(); const [e,setE]=useState(''); const [busy,setBusy]=useState(false);
 const go=async()=>{ if(busy) return; setBusy(true); const msg=await s.resetPassword(e); setBusy(false); Alert.alert('Reset', msg); };
 return <Screen><H>Reset password</H><Card><Input value={e} onChangeText={setE} placeholder="Email" autoCapitalize="none"/><Btn title={busy?'Sending…':'Request reset'} onPress={go}/><T sub>We email you a secure reset link from Firebase — the link works on any device.</T></Card></Screen>; }
