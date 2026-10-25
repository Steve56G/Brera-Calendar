// Navigazione dalle notifiche push.
// L'app non usa expo-router: le "schermate" sono i tab gestiti da App.js,
// quindi questo hook restituisce il valore di `data.screen` e lascia ad App.js
// il compito di aprire il tab giusto. Gestisce anche il cold start (app aperta
// toccando la notifica).
//
// expo-notifications è caricato in modo lazy per non far crashare Expo Go
// su Android, dove i moduli nativi del push possono mancare.

import { useEffect } from 'react';
import { getNotifications } from '../services/expoNotifications';

export function useNotificationNavigation(onOpen) {
  useEffect(() => {
    const Notifications = getNotifications();
    if (!Notifications) return undefined;

    const handleResponse = (response) => {
      const screen = response?.notification?.request?.content?.data?.screen;
      if (typeof screen === 'string' && screen) onOpen(screen);
    };

    // Notifica che ha avviato l'app: va gestita una sola volta.
    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) {
      handleResponse(lastResponse);
      Notifications.clearLastNotificationResponse();
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => subscription.remove();
  }, [onOpen]);
}
