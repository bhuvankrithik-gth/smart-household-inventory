
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StoreProvider } from '../data/store';
const qc=new QueryClient();
export default function Root(){ return <QueryClientProvider client={qc}><StoreProvider><Stack screenOptions={{headerShown:false}}><Stack.Screen name="(tabs)"/><Stack.Screen name="login"/><Stack.Screen name="register"/><Stack.Screen name="reset"/></Stack></StoreProvider></QueryClientProvider>; }
