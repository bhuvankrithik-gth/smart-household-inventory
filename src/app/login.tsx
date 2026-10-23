
import React, { useState } from 'react'; import { Alert, ScrollView, Text, View } from 'react-native'; import { Link, router } from 'expo-router'; import { useStore } from '../data/store'; import { BrandHeader, Btn, Card, Ghost, Input, Row, Screen, SectionTitle, T, useC } from '../components/ui';
export default function Login(){ const s=useStore(); const c=useC(); const [e,setE]=useState(''); const [p,setP]=useState(''); const [busy,setBusy]=useState(false);
 const go=async()=>{ if(busy) return; setBusy(true); const err=await s.login(e,p); setBusy(false); if(err) Alert.alert('Login',err); else router.replace('/(tabs)'); };
 return <Screen><ScrollView><BrandHeader tagline="Know what you have. Know what you need. Buy only what makes sense. Waste less."/>
 <Card><SectionTitle>Welcome back</SectionTitle><Input value={e} onChangeText={setE} placeholder="Email" autoCapitalize="none"/><Input value={p} onChangeText={setP} placeholder="Password" secureTextEntry/>
 <Row><Btn title={busy?'Logging in…':'Login'} onPress={go} style={{flex:1,marginVertical:0}}/><Ghost title="Create account" onPress={()=>router.push('/register')} style={{flex:1,marginVertical:0}}/></Row>
 <View style={{alignItems:'center'}}><Link href="/reset"><Text style={{color:c.sub,fontSize:13.5,fontWeight:'600'}}>Forgot password?</Text></Link></View>
 <T sub>One account works on every device — your households sync securely in the cloud, so the same login shows the same inventory everywhere.</T></Card>
 <View style={{flexDirection:'row',justifyContent:'center',gap:8,paddingVertical:10}}><Link href="/terms"><Text style={{color:c.sub,fontSize:13}}>Terms of Service</Text></Link><Text style={{color:c.sub,fontSize:13}}>·</Text><Link href="/privacy"><Text style={{color:c.sub,fontSize:13}}>Privacy Policy</Text></Link></View>
 </ScrollView></Screen>; }
