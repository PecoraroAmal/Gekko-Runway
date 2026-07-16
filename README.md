# Gekko-Runway

App di finanza personale **100% locale** (Electron + React + SQLite), con un bot Telegram opzionale per inserire dati anche da telefono. Nessun backend cloud, nessuna sincronizzazione remota: tutto — conti, movimenti, investimenti, token del bot — resta su disco, nella cartella dati dell'utente. Vedi [`master.txt`](master.txt) per la spec di progetto completa.

## Stack tecnico

- **Electron 31** — processo main in Node.js, gestisce finestra, database e bot Telegram
- **React 18** (via **Vite**) — interfaccia utente nel renderer
- **better-sqlite3** — database SQLite locale, sincrono
- **node-telegram-bot-api** — bot Telegram in polling, eseguito nel processo main
- **recharts** — grafici (andamento saldo, proiezioni, composizione portafoglio)
- Nessun framework CSS: variabili CSS custom in `src/styles.css`, light/dark mode

## Funzionalità

### Dashboard
Saldo complessivo (conti + investimenti), totale del salvadanaio (roundup + saveback accumulati), heatmap annuale delle attività in stile GitHub (verde = entrate, rosso = uscite, giallo = investimenti, con sfumatura proporzionale se in un giorno coesistono più categorie), tabella con saldo e percentuale sul totale per ogni conto.

### Conti
Conti multipli in EUR, ciascuno con saldo iniziale modificabile, colore identificativo, **roundup** e **saveback** attivabili singolarmente (con percentuale saveback configurabile per conto). Il saldo corrente è sempre calcolato come `saldo_iniziale + entrate − uscite ± trasferimenti` — roundup e saveback non lo intaccano, confluiscono solo nel salvadanaio. I conti si possono chiudere (restano in sola lettura, con storico visibile) o eliminare (cascade su tutte le transazioni collegate). Per ogni conto è disponibile il grafico dell'andamento del saldo nel tempo.

### Movimenti
Entrate, uscite e **trasferimenti** tra conti, con data, importo, tag (categoria, un solo tag per movimento), nota. Per le uscite, se il conto ha roundup/saveback attivi, si possono inserire i relativi importi (il saveback può essere calcolato automaticamente dalla percentuale del conto, ma resta sempre modificabile a mano). Filtri per tipo, conto, tag e intervallo di date. Ogni movimento mostra la propria origine (`app` o `telegram`).

### Investimenti
Portafoglio con nome asset, tipologia (crypto, azioni, obbligazioni, ETF, altro — tipologie personalizzabili), conto di riferimento, prezzo di acquisto, importo investito, prezzo target opzionale, data. Calcolo automatico di quantità, plusvalenza lorda/netta e rendimento netto in base all'aliquota fiscale della tipologia (congelata al momento della creazione: cambiarla in Impostazioni non altera gli investimenti già inseriti). Grafico a torta della composizione del portafoglio per tipologia. Gli investimenti selezionati (dello stesso conto) possono essere **liquidati** in blocco, generando un'entrata sul conto e rimuovendoli dal portafoglio.

### Previsioni
Proiezione del saldo futuro basata sulla media mensile storica delle uscite più le **spese ricorrenti** attive (mensili o annuali, con giorno/mese, data di inizio e fine opzionale). Grafico dell'andamento del saldo proiettato mese per mese fino alla data di fine impostata; la data di inizio dello storico considerato è configurabile dalle Impostazioni.

### Impostazioni
- Gestione tag personalizzati per entrate/uscite
- Aliquote fiscali per tipologia di investimento (crypto 33%, azioni 26%, obbligazioni 12,5%, ETF 26%, altro 26% di default, tutte modificabili, nuove tipologie aggiungibili)
- Date di inizio/fine per le proiezioni
- Configurazione bot Telegram (token, chat ID autorizzati, avvio/stop)
- **Backup database**: esporta il file `.db` corrente per conservarlo altrove, oppure importane uno esportato in precedenza (sostituisce interamente i dati attuali)
- **Zona pericolosa**: reset completo del database (irreversibile, richiede conferma testuale)

### Bot Telegram
Attivo solo mentre l'app è aperta; se il token è già salvato si avvia automaticamente all'apertura. Funziona come una "segreteria": i messaggi inviati mentre l'app è chiusa vengono elaborati non appena il bot torna online. Whitelist di chat ID autorizzati impostata manualmente in Impostazioni — ogni altro chat viene ignorato. Comandi disponibili:

- `/start` — messaggio di benvenuto
- `/help` — 3 esempi completi di messaggio-schema (entrata, uscita, investimento)
- `/entrate`, `/uscite`, `/investimenti` — formato dettagliato per tipo, con l'elenco aggiornato in tempo reale di conti, tag e tipologie presenti nell'app

Il bot può solo **aggiungere** nuove transazioni/investimenti (non modificare o cancellare quelli esistenti). Ogni messaggio-schema valido viene elaborato e poi cancellato dalla chat; se non valido, il bot risponde con l'elenco degli errori.

## Setup

```bash
npm install
npm run dev
```

Il DB SQLite viene creato automaticamente nella cartella `userData` di Electron (es. `~/.config/gekko-runway/gekko-runway.db` su Linux).

## Dati e privacy

Tutti i dati (conti, movimenti, investimenti, token del bot) restano solo sul disco locale, nella cartella `userData` di Electron — mai nella cartella del repository. Il `.gitignore` esclude comunque esplicitamente file `.db`/`.sqlite` e `.env`, così un eventuale export del database o una configurazione locale non finiscono mai per errore in un commit.

## Build

```bash
npm run build          # bundle del renderer in dist/
npm run package:linux   # pacchetti AppImage + deb in release/ (electron-builder)
```

L'icona dell'app si trova in `build/icon.png` ed è usata sia dalla finestra Electron in sviluppo sia dai pacchetti generati da `electron-builder`.

## Note

- Il saldo di un conto è sempre `saldo_iniziale + entrate - uscite`: roundup e saveback non lo modificano, ma confluiscono nel salvadanaio mostrato in Dashboard.
- Le aliquote fiscali degli investimenti vengono "congelate" al momento della creazione: modificarle in Impostazioni non altera gli investimenti già inseriti.
- Eliminare un conto elimina anche tutte le transazioni collegate (cascade).
