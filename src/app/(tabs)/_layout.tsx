
import { Tabs } from 'expo-router';
export default function TabsLayout(){ return <Tabs screenOptions={{headerTitle:'Smart Household Inventory'}}><Tabs.Screen name="index" options={{title:'Home'}}/><Tabs.Screen name="inventory" options={{title:'Inventory'}}/><Tabs.Screen name="shopping" options={{title:'Shopping'}}/><Tabs.Screen name="insights" options={{title:'Insights'}}/><Tabs.Screen name="profile" options={{title:'Profile'}}/></Tabs>; }
