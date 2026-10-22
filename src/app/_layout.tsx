import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StoreProvider } from '../data/store';
const qc=new QueryClient();
export default function Root(){ return <QueryClientProvider client={qc}><StoreProvider><StatusBar style="light"/><Stack screenOptions={{headerShown:false, contentStyle:{backgroundColor:'#0B1220'}}}><Stack.Screen name="(tabs)"/><Stack.Screen name="login"/><Stack.Screen name="register"/><Stack.Screen name="reset"/></Stack></StoreProvider></QueryClientProvider>; }
