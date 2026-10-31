# Orario

App Expo/React Native per importare un orario universitario dell'accademia di Brera da PDF, consultare le lezioni in lista o calendario e gestire preferiti e modifiche personali.
Si possono abilitare le notifiche per ricevere notifiche quando viene aggiornato l'orario universitario.

## Download

### Android
1. Scarica `brera-calendar-X.Y.Z.apk` dalla pagina [Releases](https://github.com/Steve56G/Brera-Calendar/releases).
2. Apri il file dal telefono. Se richiesto, consenti l'installazione da questa fonte (Impostazioni → App → Accesso speciale → Installa app sconosciute),
   oppure clicca Altri dettagli → Installa Comunque
3. Tocca **Installa** e poi **Apri**.

## Dati e privacy

Non sono necessarie chiavi API o variabili d'ambiente per eseguire l'app. Orari importati, preferiti, profilo e modifiche vengono conservati sul dispositivo tramite AsyncStorage; il progetto ha un servizio di backend diverse funzionalità dell'app (notifiche).

Per leggere i PDF, l'app carica PDF.js e il relativo worker dalla CDN pubblica cdnjs. L'importazione richiede quindi una connessione Internet per scaricare la libreria; il PDF viene elaborato nella WebView locale dell'app e non viene caricato su un servizio remoto.

I file `.env` e le credenziali di firma locali sono esclusi da Git. Non inserire segreti nel codice client o in variabili `EXPO_PUBLIC_*`: i valori inclusi nel bundle dell'app non sono segreti.

## Licenza e asset

Il codice del progetto è distribuito secondo la licenza MIT; vedere [LICENSE](./LICENSE). Le parti e gli asset provenienti dal template Expo mantengono l'attribuzione e i termini di licenza Expo indicati nel file.
