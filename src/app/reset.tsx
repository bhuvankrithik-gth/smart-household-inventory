
import React,{useState} from 'react'; import { Alert } from 'react-native'; import { useStore } from '../data/store'; import { Btn, Card, H, Input, Screen } from '../components/ui';
export default function Reset(){ const s=useStore(); const [e,setE]=useState(''); return <Screen><H>Reset password</H><Card><Input value={e} onChangeText={setE} placeholder="Email" autoCapitalize="none"/><Btn title="Request reset" onPress={()=>Alert.alert('Reset', s.resetPassword(e))}/></Card></Screen>; }
