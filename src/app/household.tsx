
import React,{useState} from 'react'; import { Alert, ScrollView } from 'react-native'; import { useStore } from '../data/store'; import { Btn, Card, Ghost, H, Input, Screen, T } from '../components/ui';
export default function Household(){ const s=useStore(); const [name,setName]=useState(''); const [code,setCode]=useState('');
 return <Screen><ScrollView><H>Household</H><Card><T>Current: {s.household?.name||'none'}</T><T sub>Invite code (share with family): {s.household?.inviteCode||'—'} · Members see shared inventory & lists. Household data is isolated by household id in the local store and by firestore.rules in cloud mode.</T></Card>
 <Card><H>Your households</H>{s.db.households.filter(h=>s.db.members.some(m=>m.householdId===h.id&&m.userId===s.user?.id)).map(h=><Ghost key={h.id} title={`${h.name}${h.id===s.household?.id?' (current)':''}`} onPress={()=>s.switchHousehold(h.id)}/>)}</Card>
 <Card><H>Create household</H><Input value={name} onChangeText={setName} placeholder="e.g. Sharma Home"/><Btn title="Create" onPress={()=>{ if(name.trim()){ s.createHousehold(name); setName(''); } }}/></Card>
 <Card><H>Join with invite code</H><Input value={code} onChangeText={setCode} placeholder="Invite code"/><Btn title="Join" onPress={()=>{ const err=s.joinHousehold(code); Alert.alert('Join', err||'Joined household.'); }}/></Card>
 <Card><H>Members</H>{s.members.map(m=><T key={m.id}>{m.name} · {m.email} · {m.role}{s.household?.ownerId===s.user?.id&&m.userId!==s.user?.id? ' — tap Remove below':''}</T>)}{s.members.filter(m=>m.userId!==s.user?.id).map(m=><Ghost key={'r'+m.id} title={`Remove ${m.name}`} onPress={()=>s.removeMember(m.id)}/>)}</Card>
 <Btn danger title="Leave current household" onPress={()=>Alert.alert('Leave?','You will lose access to this household on this device.',[{text:'Cancel'},{text:'Leave',style:'destructive',onPress:()=>s.leaveHousehold()}])}/>
 </ScrollView></Screen>; }
