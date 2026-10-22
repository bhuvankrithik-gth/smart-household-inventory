import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useC } from '../../components/ui';
export default function TabsLayout(){ const c=useC(); const tint=(focused:boolean)=> focused? c.accent : c.sub; return <Tabs screenOptions={{ headerTitle:'Smart Household Inventory', headerStyle:{backgroundColor:c.card}, headerTintColor:c.text, headerTitleStyle:{fontWeight:'700'}, headerShadowVisible:false, tabBarStyle:{backgroundColor:c.card,borderTopColor:c.border,borderTopWidth:1,height:62,paddingBottom:8,paddingTop:6}, tabBarActiveTintColor:c.accent, tabBarInactiveTintColor:c.sub, tabBarLabelStyle:{fontSize:11,fontWeight:'600'} }}>
<Tabs.Screen name="index" options={{title:'Home', tabBarIcon:({size,focused})=> <Ionicons name={focused?'home':'home-outline'} size={size} color={tint(focused)}/>}}/>
<Tabs.Screen name="inventory" options={{title:'Inventory', tabBarIcon:({size,focused})=> <Ionicons name={focused?'cube':'cube-outline'} size={size} color={tint(focused)}/>}}/>
<Tabs.Screen name="shopping" options={{title:'Shopping', tabBarIcon:({size,focused})=> <Ionicons name={focused?'cart':'cart-outline'} size={size} color={tint(focused)}/>}}/>
<Tabs.Screen name="insights" options={{title:'Insights', tabBarIcon:({size,focused})=> <Ionicons name={focused?'stats-chart':'stats-chart-outline'} size={size} color={tint(focused)}/>}}/>
<Tabs.Screen name="profile" options={{title:'Profile', tabBarIcon:({size,focused})=> <Ionicons name={focused?'person-circle':'person-circle-outline'} size={size} color={tint(focused)}/>}}/>
</Tabs>; }
