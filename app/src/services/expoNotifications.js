// Caricamento "lazy" di expo-notifications.
// In Expo Go su Android il push remoto non è supportato e alcune versioni di
// Expo Go non includono i moduli nativi più recenti: un import statico farebbe
// crashare l'app all'avvio. Qui il modulo viene caricato solo quando serve
// davvero (development build / produzione), così Expo Go resta utilizzabile.

import { Platform } from 'react-native';
import Constants from 'expo-constants';

export const isExpoGoAndroid =
  Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient';

let loaded = false;
let notifications = null;

export function getNotifications() {
  if (Platform.OS === 'web' || isExpoGoAndroid) return null;

  if (!loaded) {
    loaded = true;
    try {
      notifications = require('expo-notifications');
    } catch (error) {
      console.warn(
        '[notifications] impossibile caricare expo-notifications:',
        error?.message || error
      );
      notifications = null;
    }
  }

  return notifications;
}
