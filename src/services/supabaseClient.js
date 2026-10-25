// Client Supabase condiviso.
// URL e publishable key sono pubblici (stanno in app.json > extra) e sono
// protetti dalle policy RLS di Supabase, non dal segreto.
// Le variabili EXPO_PUBLIC_* sono un override opzionale per build diverse.

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || Constants.expoConfig?.extra?.supabaseUrl;

const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  Constants.expoConfig?.extra?.supabasePublishableKey;

// Se la configurazione manca l'app resta utilizzabile: le funzioni che usano
// Supabase controllano `supabase` e non fanno nulla.
export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
