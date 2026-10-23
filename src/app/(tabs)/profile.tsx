
import React from 'react'; import { Alert, ScrollView, Text, View } from 'react-native'; import { router } from 'expo-router'; import { useStore } from '../../data/store'; import { Btn, Card, FeatureBlock, H, Screen, T, useC } from '../../components/ui';
export default function Profile(){ const s=useStore(); const c=useC(); return <Screen><ScrollView><H>Profile</H><Card><View style={{gap:2}}><Text style={{color:c.text,fontSize:18,fontWeight:'700'}}>{s.user?.name}</Text><T sub>{s.user?.email}</T></View><T sub>Household: {s.household?.name||'none'} · Invite code: {s.household?.inviteCode||'—'}</T><T sub>Signed in with your cloud account — this same login works on any device. Changes waiting to upload: {s.db.pendingOps.length} — they sync automatically when you are back online.</T></Card>
 <FeatureBlock icon="people" title="Household & members" sub="Invite code, members & switching" onPress={()=>router.push('/household')}/>
 <FeatureBlock icon="settings" title="Settings" sub="Preferences & notifications" onPress={()=>router.push('/settings')}/>
 <FeatureBlock icon="document-text" title="Terms of Service" sub="Legal" onPress={()=>router.push('/terms')}/>
 <FeatureBlock icon="shield-checkmark" title="Privacy Policy" sub="Legal" onPress={()=>router.push('/privacy')}/>
 <FeatureBlock icon="library" title="Open-source licences" sub="Legal" onPress={()=>router.push('/licences')} style={{marginBottom:16}}/>
 <Btn danger title="Delete household data" onPress={()=>Alert.alert('Delete household data?','This permanently deletes this household and all its inventory, lists, purchases and waste from the cloud, for every member.',[{text:'Cancel'},{text:'Delete',style:'destructive',onPress:async()=>{ const err=await s.deleteHouseholdData(); if(err) Alert.alert('Delete household data', err); }}])}/>
 <Btn danger title="Logout" onPress={async()=>{ await s.logout(); router.replace('/login'); }}/>
 <Btn danger title="Delete account & my data" onPress={()=>Alert.alert('Delete account?','This permanently deletes your cloud account: households you own are deleted, you are removed from households you joined, and your profile is erased. This cannot be undone.',[{text:'Cancel'},{text:'Delete',style:'destructive',onPress:async()=>{ const err=await s.deleteAccount(); if(err) Alert.alert('Delete account', err); else router.replace('/login'); }}])}/>
 </ScrollView></Screen>; }

