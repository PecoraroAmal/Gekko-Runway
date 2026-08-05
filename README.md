# Gekko-Runway

App di finanza personale **self-hosted** (Node.js/Express + React + SQLite). Nessuna sincronizzazione remota: tutti i dati (conti, movimenti, investimenti) restano su disco, nella cartella `data/` del progetto.

## Stack tecnico

- **Express** — server Node.js: serve il frontend compilato ed espone l'API sotto `/api/gekko-runway/`
- **React 18** (via **Vite**) — interfaccia utente
- **better-sqlite3** — database SQLite locale, sincrono
- **recharts** — grafici (andamento saldo, proiezioni, composizione portafoglio)
- Nessun framework CSS: variabili CSS custom in `src/styles.css`, light/dark mode, layout responsive (il menu passa in orizzontale in cima sotto i 600px)

## Funzionalità

### Dashboard
Saldo complessivo (conti + investimenti), totale del salvadanaio (roundup + saveback accumulati), heatmap annuale delle attività in stile GitHub (verde = entrate, rosso = uscite, giallo = investimenti, con sfumatura proporzionale se in un giorno coesistono più categorie, dettaglio dei movimenti al click su un giorno), tabella con saldo e percentuale sul totale per ogni conto.

### Conti
Conti multipli in EUR, ciascuno con saldo iniziale modificabile, colore identificativo, **roundup** e **saveback** attivabili singolarmente (con percentuale saveback configurabile per conto). I conti si possono chiudere (restano in sola lettura, con storico visibile) o eliminare (cascade su tutte le transazioni collegate). Per ogni conto è disponibile il grafico dell'andamento del saldo nel tempo. Form di creazione/modifica in finestra modale, apribile dal bottone "Aggiungi conto".

### Movimenti
Entrate, uscite e **trasferimenti** tra conti, con data, importo, tag (categoria, un solo tag per movimento), nota. Per le uscite, se il conto ha roundup/saveback attivi, si possono inserire i relativi importi (il saveback può essere calcolato automaticamente dalla percentuale del conto, ma resta sempre modificabile a mano); una checkbox permette di escludere una singola uscita dal calcolo delle Previsioni (utile per spese una tantum non rappresentative della media). Filtri per tipo, conto, tag e intervallo di date. Form in finestra modale, apribile dal bottone "Aggiungi movimento".

### Investimenti
Portafoglio con nome asset, tipologia (crypto, azioni, obbligazioni, ETF, altro — tipologie personalizzabili), conto di riferimento, prezzo di acquisto, importo investito, prezzo target opzionale, data. Calcolo automatico di quantità, plusvalenza lorda/netta e rendimento netto in base all'aliquota fiscale della tipologia (congelata al momento della creazione: cambiarla in Impostazioni non altera gli investimenti già inseriti). Grafico a torta della composizione del portafoglio per tipologia. Gli investimenti selezionati (dello stesso conto) possono essere **liquidati** in blocco, generando un'entrata sul conto e rimuovendoli dal portafoglio. Form di creazione/modifica in finestra modale, apribile dal bottone "Aggiungi investimento".

### Previsioni
Proiezione del saldo futuro basata sulla media mensile storica delle uscite (escluse quelle marcate "non considerare nelle Previsioni") più le **spese ricorrenti** attive (mensili o annuali, con giorno/mese, data di inizio e fine opzionale). Grafico dell'andamento del saldo proiettato mese per mese fino alla data di fine impostata; la data di inizio dello storico considerato è configurabile dalle Impostazioni. Form spese ricorrenti in finestra modale, apribile dal bottone "Aggiungi spesa ciclica".

### Impostazioni
- **Aspetto**: cambio tema chiaro/scuro
- Gestione tag personalizzati per entrate/uscite
- Aliquote fiscali per tipologia di investimento (crypto 33%, azioni 26%, obbligazioni 12,5%, ETF 26%, altro 26% di default, tutte modificabili, nuove tipologie aggiungibili)
- Date di inizio/fine per le proiezioni
- **Backup database**: esporta il file `.db` corrente (download dal browser) per conservarlo altrove, oppure importane uno esportato in precedenza (upload, sostituisce interamente i dati attuali)
- **Zona pericolosa**: reset completo del database (irreversibile, richiede conferma testuale)

## Architettura

`server.js` è l'unico entry point: espone il frontend compilato (`dist/`) e un'API sotto `/api/gekko-runway/`:
- `GET /api/gekko-runway/data?channel=...` — operazioni di sola lettura
- `POST /api/gekko-runway/data` — operazioni di scrittura (`{ channel, payload }`)
- `GET /api/gekko-runway/export` / `POST /api/gekko-runway/import` — backup/ripristino del database
- `GET /api/gekko-runway/events` — Server-Sent Events, aggiorna in tempo reale le tab aperte quando i dati cambiano

La logica di business (query, calcoli, migrazioni dello schema) vive in `server/db.js`. Il frontend (`src/`) parla con l'API tramite `src/apiClient.js`, esposto globalmente come `window.electronAPI` per compatibilità storica con le pagine esistenti.

## Setup

```bash
npm install
npm run build
npm start
```

L'app è disponibile su `http://localhost:3000` (porta configurabile con `PORT`). Il DB SQLite viene creato automaticamente in `data/gekko-runway.db`, cartella non tracciata da git.

Variabili d'ambiente opzionali:
- `PORT` — porta di ascolto (default `3000`)
- `IDLE_SHUTDOWN_MINUTES` — minuti di inattività prima dell'arresto automatico del processo, `0` per disabilitarlo (default `15`)
- `LISTEN_FDS` — impostata automaticamente da systemd in caso di socket activation, non va settata a mano

## Dati e privacy

Tutti i dati (conti, movimenti, investimenti) restano solo sul disco locale, nella cartella `data/` del progetto — mai nella cartella del repository git. Il `.gitignore` esclude esplicitamente `data/`, i file `.db`/`.sqlite` e `.env`, così un eventuale export del database o una configurazione locale non finiscono mai per errore in un commit.

## Build

```bash
npm run build   # bundle del frontend in dist/, servito da server.js
```

## Note

- Il saldo di un conto è `saldo_iniziale + entrate − (uscite + roundup + saveback) ± trasferimenti`: a differenza di quanto si potrebbe pensare, roundup e saveback **riducono** il saldo del conto (oltre a confluire nel salvadanaio mostrato in Dashboard) — non sono un accantonamento "a lato".
- Le aliquote fiscali degli investimenti vengono "congelate" al momento della creazione: modificarle in Impostazioni non altera gli investimenti già inseriti.
- Eliminare un conto elimina anche tutte le transazioni collegate (cascade).
- Le uscite possono essere escluse singolarmente dal calcolo delle Previsioni (checkbox "Considera nelle Previsioni" nel form movimento).
