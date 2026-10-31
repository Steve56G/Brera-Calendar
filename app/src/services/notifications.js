// Registrazione del dispositivo per le notifiche push.
// Salva token, preferenze (attive / solo semestre corrente) e lingua nella
// tabella `devices`. expo-notifications non viene importato staticamente:
// vedi expoNotifications.js.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabaseClient';
import { getNotifications, isExpoGoAndroid } from './expoNotifications';

const CHANNEL_ID = 'default';
const TOKEN_KEY = '@orario/expoPushToken';

let handlerConfigured = false;

function configureHandler(Notifications) {
  if (handlerConfigured) return;
  handlerConfigured = true;
  // Le notifiche ricevute con l'app in primo piano vanno comunque mostrate.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// La RPC è security definer e fa INSERT/UPDATE in un colpo solo: bypassa RLS
// e non dipende dalle policy UPDATE della tabella.
async function saveDevice({ token, notificationsActive, onlyCurrentSemester, language }) {
  const { error } = await supabase.rpc('register_device', {
    p_token: token,
    p_active: notificationsActive,
    p_only_current: notificationsActive ? onlyCurrentSemester : false,
    p_language: language,
  });
  if (error) throw error;
}

/**
 * Registra/aggiorna il device su Supabase.
 * Con notificationsActive=false non chiede permessi: usa il token già salvato
 * per disattivare la riga. In quel caso anche only_current_semester è false.
 *
 * @param {{ notificationsActive?: boolean, onlyCurrentSemester?: boolean, language?: 'it'|'en', requestPermissions?: boolean, onError?: (message: string) => void }} options
 * @returns {Promise<string|null>} token Expo, oppure null se non registrato.
 */
export async function registerDevice({
  notificationsActive = true,
  onlyCurrentSemester = false,
  language = 'it',
  requestPermissions = true,
  onError,
} = {}) {
  if (Platform.OS === 'web' || !Device.isDevice) return null;

  // In Expo Go su Android il push remoto non esiste (SDK 53+): non ha senso
  // chiedere il permesso né tentare di ottenere un token.
  if (isExpoGoAndroid) {
    console.info(
      '[notifications] Expo Go (Android): push remoto non disponibile. Usa un development build per testarlo.'
    );
    return null;
  }

  if (!supabase) {
    const message =
      'Supabase non configurato: controlla app.json > extra o le variabili EXPO_PUBLIC_SUPABASE_*';
    console.warn(`[notifications] ${message}`);
    onError?.(message);
    return null;
  }

  const deviceLanguage = language === 'en' ? 'en' : 'it';

  try {
    if (!notificationsActive) {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) return null;

      await saveDevice({
        token,
        notificationsActive: false,
        onlyCurrentSemester: false,
        language: deviceLanguage,
      });

      return token;
    }

    const Notifications = getNotifications();
    if (!Notifications) {
      onError?.('expo-notifications non disponibile in questa build');
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      const message = 'projectId EAS mancante in app.json';
      console.warn(`[notifications] ${message}`);
      onError?.(message);
      return null;
    }

    configureHandler(Notifications);

    // Android 13+: senza un canale il prompt di sistema non compare.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Brera Calendar',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && requestPermissions) {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') {
      onError?.('Permesso notifiche non concesso');
      return null;
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

    // Se il salvataggio locale fallisce, non registrare il device remoto.
    await AsyncStorage.setItem(TOKEN_KEY, token);

    await saveDevice({
        token,
        notificationsActive: true,
        onlyCurrentSemester,
        language: deviceLanguage,
    });

    return token;
  } catch (e) {
    const message = [e?.message || String(e), e?.code, e?.hint].filter(Boolean).join(' | ');
    console.warn(
      `[notifications] aggiornamento del dispositivo fallito: ${message}. ` +
        'Se la funzione non esiste, esegui supabase/register_device.sql.'
    );
    onError?.(message);
    return null;
  }
}
