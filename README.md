# Gekko-Runway

App di finanza personale **self-hosted** (Node.js/Express + React + SQLite). Nessuna sincronizzazione remota: tutto — conti, movimenti, investimenti — resta su disco, nella cartella `data/` locale al progetto. Vedi [`master.txt`](master.txt) per la spec di progetto completa.

## Stack tecnico

- **Express** — server Node.js: serve il frontend compilato ed espone l'API sotto `/api/gekko-runway/`
- **React 18** (via **Vite**) — interfaccia utente
- **better-sqlite3** — database SQLite locale, sincrono
- **recharts** — grafici (andamento saldo, proiezioni, composizione portafoglio)
- Nessun framework CSS: variabili CSS custom in `src/styles.css`, light/dark mode

## Funzionalità

### Dashboard
Saldo complessivo (conti + investimenti), totale del salvadanaio (roundup + saveback accumulati), heatmap annuale delle attività in stile GitHub (verde = entrate, rosso = uscite, giallo = investimenti, con sfumatura proporzionale se in un giorno coesistono più categorie), tabella con saldo e percentuale sul totale per ogni conto.

### Conti
Conti multipli in EUR, ciascuno con saldo iniziale modificabile, colore identificativo, **roundup** e **saveback** attivabili singolarmente (con percentuale saveback configurabile per conto). Il saldo corrente è sempre calcolato come `saldo_iniziale + entrate − uscite ± trasferimenti` — roundup e saveback non lo intaccano, confluiscono solo nel salvadanaio. I conti si possono chiudere (restano in sola lettura, con storico visibile) o eliminare (cascade su tutte le transazioni collegate). Per ogni conto è disponibile il grafico dell'andamento del saldo nel tempo.

### Movimenti
Entrate, uscite e **trasferimenti** tra conti, con data, importo, tag (categoria, un solo tag per movimento), nota. Per le uscite, se il conto ha roundup/saveback attivi, si possono inserire i relativi importi (il saveback può essere calcolato automaticamente dalla percentuale del conto, ma resta sempre modificabile a mano). Filtri per tipo, conto, tag e intervallo di date.

### Investimenti
Portafoglio con nome asset, tipologia (crypto, azioni, obbligazioni, ETF, altro — tipologie personalizzabili), conto di riferimento, prezzo di acquisto, importo investito, prezzo target opzionale, data. Calcolo automatico di quantità, plusvalenza lorda/netta e rendimento netto in base all'aliquota fiscale della tipologia (congelata al momento della creazione: cambiarla in Impostazioni non altera gli investimenti già inseriti). Grafico a torta della composizione del portafoglio per tipologia. Gli investimenti selezionati (dello stesso conto) possono essere **liquidati** in blocco, generando un'entrata sul conto e rimuovendoli dal portafoglio.

### Previsioni
Proiezione del saldo futuro basata sulla media mensile storica delle uscite più le **spese ricorrenti** attive (mensili o annuali, con giorno/mese, data di inizio e fine opzionale). Grafico dell'andamento del saldo proiettato mese per mese fino alla data di fine impostata; la data di inizio dello storico considerato è configurabile dalle Impostazioni.

### Impostazioni
- Gestione tag personalizzati per entrate/uscite
- Aliquote fiscali per tipologia di investimento (crypto 33%, azioni 26%, obbligazioni 12,5%, ETF 26%, altro 26% di default, tutte modificabili, nuove tipologie aggiungibili)
- Date di inizio/fine per le proiezioni
- **Backup database**: esporta il file `.db` corrente per conservarlo altrove, oppure importane uno esportato in precedenza (sostituisce interamente i dati attuali)
- **Zona pericolosa**: reset completo del database (irreversibile, richiede conferma testuale)

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
- `LISTEN_FDS` — impostata automaticamente da systemd in caso di socket activation

## Dati e privacy

Tutti i dati (conti, movimenti, investimenti) restano solo sul disco locale, nella cartella `data/` del progetto — mai nella cartella del repository git. Il `.gitignore` esclude esplicitamente `data/`, i file `.db`/`.sqlite` e `.env`, così un eventuale export del database o una configurazione locale non finiscono mai per errore in un commit.

## Build

```bash
npm run build   # bundle del frontend in dist/, servito da server.js
```

## Note

- Il saldo di un conto è sempre `saldo_iniziale + entrate - uscite`: roundup e saveback non lo modificano, ma confluiscono nel salvadanaio mostrato in Dashboard.
- Le aliquote fiscali degli investimenti vengono "congelate" al momento della creazione: modificarle in Impostazioni non altera gli investimenti già inseriti.
- Eliminare un conto elimina anche tutte le transazioni collegate (cascade).
