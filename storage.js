// storage.js
// Persistenza locale con AsyncStorage (compatibile con Expo Go).
// Ogni dato è salvato come JSON sotto una chiave "@orario/<key>":
//   @orario/schedule   -> scheduleMatrix estratta dal PDF (serve per ricostruire il calendario al riavvio)
//   @orario/fileName   -> nome del PDF importato
//   @orario/favorites  -> array di id dei corsi preferiti
//   @orario/edits      -> { [chiaveEvento]: { subject, details, note, start, end, startLabel, endLabel } }
//   @orario/courseColors -> { [idCorso]: colore esadecimale }
// Preferiti e modifiche sono legati agli id/chiavi dello schedule salvato: vengono azzerati insieme
// quando si importa un nuovo PDF (comportamento già presente in App.js).

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@orario/';

/**
 * Come useState, ma il valore viene ripristinato all'avvio e salvato a ogni modifica.
 * @returns [value, setValue, loaded]  -- `loaded` è false finché il ripristino non è terminato
 */
export function usePersistentState(key, initial, { encode = (v) => v, decode = (v) => v } = {}) {
  const [value, setValue] = useState(initial);
  const [loaded, setLoaded] = useState(false);

  // ripristino all'avvio
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(PREFIX + key)
      .then((raw) => {
        if (alive && raw != null) setValue(decode(JSON.parse(raw)));
      })
      .catch(() => {}) // dato assente o corrotto: si riparte dal valore iniziale
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // salvataggio a ogni modifica (solo dopo il ripristino, per non sovrascrivere i dati salvati)
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(PREFIX + key, JSON.stringify(encode(value))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, loaded, key]);

  return [value, setValue, loaded];
}

// Elimina tutti i dati locali del calendario
const KEYS = ['schedule', 'fileName', 'favorites', 'edits', 'courseColors'];
export const clearCalendarData = () => AsyncStorage.multiRemove(KEYS.map((k) => PREFIX + k));

// Codifica/decodifica per i Set
export const setCodec = { encode: (s) => [...s], decode: (a) => new Set(a) };
