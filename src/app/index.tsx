
import { Redirect } from 'expo-router'; import { useStore } from '../data/store'; import { Text, View } from 'react-native';
export default function Index(){ const s=useStore(); if(!s.ready) return <View style={{flex:1,justifyContent:'center',alignItems:'center'}}><Text>Loading Smart Household Inventory…</Text></View>; return <Redirect href={s.user? '/(tabs)' : '/login'} />; }
