const TelegramBot = require('node-telegram-bot-api')
const { v4: uuidv4 } = require('uuid')
const db = require('./db')

function capitalize(str) {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// Rimuove qualunque ReplyKeyboardMarkup rimasta sul client Telegram da versioni
// precedenti del bot (flusso a bottoni Entrata/Uscita/Investimento, ora eliminato).
function removeKb() {
  return { reply_markup: { remove_keyboard: true } }
}

let botInstance = null
let win = null

function sendDataChanged(entity) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('data-changed', { entity, source: 'telegram' })
  }
}

function isAuthorized(chatId) {
  const authorized = db.settings.getSetting('telegram_chat_id')
  if (!authorized) return false
  const ids = authorized.split(',').map((s) => s.trim()).filter(Boolean)
  return ids.includes(String(chatId))
}

function parseAmount(text) {
  const n = Number(String(text).trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function parseDateIt(text) {
  const m = String(text).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const daysInMonth = month >= 1 && month <= 12 ? new Date(year, month, 0).getDate() : 0
  if (day < 1 || day > daysInMonth) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ===================== MESSAGGI-SCHEMA (segreteria) =====================
// Un messaggio nel gruppo la cui prima riga è "entrata" / "uscita" / "investimento"
// viene interpretato come schema chiave: valore, indipendentemente da eventuali
// sessioni a bottoni in corso. Se valido, i dati vengono inseriti e il messaggio
// originale viene eliminato dal gruppo (richiede permessi admin del bot); se non
// valido, il messaggio resta e il bot risponde spiegando l'errore.

const SCHEMA_TYPES = ['entrata', 'uscita', 'investimento', 'trasferimento']

function parseSchemaMessage(text) {
  const lines = String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return null
  const type = lines[0].toLowerCase()
  if (!SCHEMA_TYPES.includes(type)) return null
  const fields = {}
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    fields[key] = value
  }
  return { type, fields }
}

function buildTransactionFromSchema(type, fields) {
  const errors = []

  const amount = fields.importo != null ? parseAmount(fields.importo) : null
  if (amount == null) errors.push('importo mancante o non valido')

  let account = null
  if (!fields.conto) {
    errors.push('conto mancante')
  } else {
    account = db.accounts.getAccounts().find((a) => a.name.toLowerCase() === fields.conto.toLowerCase())
    if (!account) errors.push(`conto "${fields.conto}" non trovato`)
    else if (!account.active) errors.push(`conto "${fields.conto}" è chiuso`)
  }

  let tag = null
  if (!fields.tag) {
    errors.push('tag mancante')
  } else {
    tag = db.tags.getTags(type).find((t) => t.name.toLowerCase() === fields.tag.toLowerCase())
    if (!tag) errors.push(`tag "${fields.tag}" non trovato per ${type}`)
  }

  let date = todayStr()
  if (fields.data) {
    const parsed = parseDateIt(fields.data)
    if (!parsed) errors.push('data non valida (usa GG/MM/AAAA)')
    else date = parsed
  }

  let roundup = 0
  if (fields.roundup) {
    if (account && !account.roundup_enabled) errors.push(`roundup non consentito per il conto "${account.name}"`)
    const val = parseAmount(fields.roundup)
    if (val == null) errors.push('roundup non valido')
    else roundup = val
  }

  let saveback = 0
  if (fields.saveback) {
    if (account && !account.saveback_enabled) errors.push(`saveback non consentito per il conto "${account.name}"`)
    const val = parseAmount(fields.saveback)
    if (val == null) errors.push('saveback non valido')
    else saveback = val
  }

  if (errors.length > 0) return { errors }

  return {
    errors: [],
    payload: {
      type,
      amount,
      account_id: account.id,
      tag: tag.name,
      note: fields.nota || null,
      roundup,
      saveback,
      date,
      uuid: uuidv4(),
      source: 'telegram'
    }
  }
}

function buildInvestmentFromSchema(fields) {
  const errors = []

  if (!fields.asset) errors.push('asset mancante')

  let rateRow = null
  if (!fields.tipo) {
    errors.push('tipo mancante')
  } else {
    rateRow = db.assetTaxRates.getAssetTaxRates().find((r) => r.type.toLowerCase() === fields.tipo.toLowerCase())
    if (!rateRow) errors.push(`tipo "${fields.tipo}" non trovato`)
  }

  let account = null
  if (!fields.conto) {
    errors.push('conto mancante')
  } else {
    account = db.accounts.getAccounts().find((a) => a.name.toLowerCase() === fields.conto.toLowerCase())
    if (!account) errors.push(`conto "${fields.conto}" non trovato`)
    else if (!account.active) errors.push(`conto "${fields.conto}" è chiuso`)
  }

  const buyPrice = fields.prezzo != null ? parseAmount(fields.prezzo) : null
  if (buyPrice == null) errors.push('prezzo mancante o non valido')

  const amountInvested = fields.importo != null ? parseAmount(fields.importo) : null
  if (amountInvested == null) errors.push('importo mancante o non valido')

  let targetPrice = null
  if (fields.target) {
    targetPrice = parseAmount(fields.target)
    if (targetPrice == null) errors.push('target non valido')
  }

  let date = todayStr()
  if (fields.data) {
    const parsed = parseDateIt(fields.data)
    if (!parsed) errors.push('data non valida (usa GG/MM/AAAA)')
    else date = parsed
  }

  if (errors.length > 0) return { errors }

  return {
    errors: [],
    payload: {
      asset_name: fields.asset,
      tag: rateRow.type,
      tax_rate: rateRow.rate,
      account_id: account.id,
      buy_price: buyPrice,
      amount_invested: amountInvested,
      target_price: targetPrice,
      date,
      uuid: uuidv4(),
      source: 'telegram'
    }
  }
}

function buildTransferFromSchema(fields) {
  const errors = []

  const amount = fields.importo != null ? parseAmount(fields.importo) : null
  if (amount == null) errors.push('importo mancante o non valido')

  let fromAccount = null
  if (!fields.da) {
    errors.push('conto di origine mancante')
  } else {
    fromAccount = db.accounts.getAccounts().find((a) => a.name.toLowerCase() === fields.da.toLowerCase())
    if (!fromAccount) errors.push(`conto di origine "${fields.da}" non trovato`)
    else if (!fromAccount.active) errors.push(`conto di origine "${fields.da}" è chiuso`)
  }

  let toAccount = null
  if (!fields.a) {
    errors.push('conto di destinazione mancante')
  } else {
    toAccount = db.accounts.getAccounts().find((a) => a.name.toLowerCase() === fields.a.toLowerCase())
    if (!toAccount) errors.push(`conto di destinazione "${fields.a}" non trovato`)
    else if (!toAccount.active) errors.push(`conto di destinazione "${fields.a}" è chiuso`)
  }

  if (fromAccount && toAccount && fromAccount.id === toAccount.id) {
    errors.push('il conto di origine e destinazione non possono coincidere')
  }

  let date = todayStr()
  if (fields.data) {
    const parsed = parseDateIt(fields.data)
    if (!parsed) errors.push('data non valida (usa GG/MM/AAAA)')
    else date = parsed
  }

  if (errors.length > 0) return { errors }

  return {
    errors: [],
    payload: {
      type: 'trasferimento',
      amount,
      account_id: fromAccount.id,
      to_account_id: toAccount.id,
      tag: null,
      note: fields.nota || null,
      roundup: 0,
      saveback: 0,
      date,
      uuid: uuidv4(),
      source: 'telegram'
    }
  }
}

async function tryHandleSchemaMessage(msg) {
  const chatId = msg.chat.id
  const text = (msg.text || '').trim()
  const parsed = parseSchemaMessage(text)
  if (!parsed) return false

  const { type, fields } = parsed
  const result =
    type === 'investimento'
      ? buildInvestmentFromSchema(fields)
      : type === 'trasferimento'
      ? buildTransferFromSchema(fields)
      : buildTransactionFromSchema(type, fields)

  if (result.errors.length > 0) {
    await botInstance.sendMessage(
      chatId,
      `Messaggio "${type}" non valido:\n- ${result.errors.join('\n- ')}\n\nCorreggi e rimanda il messaggio.`,
      { reply_to_message_id: msg.message_id, ...removeKb() }
    )
    return true
  }

  if (type === 'investimento') {
    db.investments.createInvestment(result.payload)
    sendDataChanged('investments')
    sendDataChanged('transactions')
  } else {
    db.transactions.createTransaction(result.payload)
    sendDataChanged('transactions')
  }

  try {
    await botInstance.deleteMessage(chatId, msg.message_id)
  } catch (err) {
    console.error('Impossibile eliminare il messaggio Telegram:', err.message)
  }

  const pastParticiple = { entrata: 'registrata', uscita: 'registrata', investimento: 'registrato', trasferimento: 'registrato' }
  await botInstance.sendMessage(chatId, `✅ ${capitalize(type)} ${pastParticiple[type]}.`, removeKb())
  return true
}

// ===================== COMANDI /start, /help, /entrate, /uscite, /investimenti =====================

const START_TEXT = 'Bot Gordon Gekko attivo. Invia /help per vedere come scrivere un messaggio e registrare un movimento.'

const HELP_TEXT = `Copia uno di questi esempi, modifica i valori e invia il messaggio. Il bot lo elabora,
salva il dato e cancella il messaggio dalla chat. * = campo obbligatorio (togli l'asterisco
dal nome campo prima di inviare il messaggio).

entrata
importo*: 1500
conto*: Conto Corrente
tag*: Stipendio
nota: Stipendio di luglio
data: 14/07/2026

uscita
importo*: 45.90
conto*: Conto Corrente
tag*: Spesa
nota: Spesa al supermercato
data: 14/07/2026
roundup: 0.10
saveback: 2.50

investimento
asset*: Bitcoin
tipo*: crypto
conto*: Conto Corrente
prezzo*: 60000
importo*: 500
target: 80000
data: 14/07/2026

trasferimento
importo*: 200
da*: Conto Corrente
a*: Conto Risparmio
nota: Accantonamento mensile
data: 14/07/2026

I campi senza asterisco sono opzionali: lascia la riga vuota dopo i due punti (es. "nota:")
oppure omettila del tutto. Se ometti "data" viene usata la data di oggi. roundup e saveback
sono accettati solo se il conto li ha attivi. I conti chiusi non sono utilizzabili. Un
investimento addebita subito il conto per l'importo investito; la liquidazione (dall'app)
accredita il conto con l'incasso della vendita.

Invia /entrate, /uscite, /investimenti o /trasferimenti per il formato dettagliato con
l'elenco di conti, tag e tipologie disponibili in questo momento nell'app.`

function fmtList(items, emptyMsg) {
  return items.length > 0 ? items.join(', ') : emptyMsg
}

function accountsListText() {
  return fmtList(db.accounts.getAccounts().filter((a) => a.active).map((a) => a.name), 'nessuno — creane uno dall\'app')
}

function tagsListText(type) {
  return fmtList(db.tags.getTags(type).map((t) => t.name), 'nessuno — aggiungine uno dalle Impostazioni')
}

function assetTypesListText() {
  return fmtList(
    db.assetTaxRates.getAssetTaxRates().map((r) => `${r.type}`),
    'nessuna — aggiungine una dalle Impostazioni'
  )
}

function entrateText() {
  return `entrata
importo: 
conto: ${accountsListText()}
tag: ${tagsListText('entrata')}
nota:
data: GG/MM/AAAA`
}

function usciteText() {
  return `
uscita
importo: 
conto: ${accountsListText()}
tag: ${tagsListText('uscita')}
nota: 
data: GG/MM/AAAA
roundup: 
saveback: `
}

function investimentiText() {
  return `
investimento
asset:
tipo: ${assetTypesListText()}
conto: ${accountsListText()}
prezzo:
importo:
target:
data: GG/MM/AAAA`
}

function trasferimentiText() {
  return `
trasferimento
importo:
da: ${accountsListText()}
a: ${accountsListText()}
nota:
data: GG/MM/AAAA`
}

// ===================== MESSAGE HANDLER =====================

async function handleMessage(msg) {
  const chatId = msg.chat.id
  const text = (msg.text || '').trim()

  if (text === '/start') {
    if (!isAuthorized(chatId)) {
      await botInstance.sendMessage(
        chatId,
        `Non sei autorizzato a usare questo bot.\nIl tuo Chat ID è: ${chatId}\nChiedi di inserirlo nelle Impostazioni dell'app.`,
        removeKb()
      )
      return
    }
    await botInstance.sendMessage(chatId, START_TEXT, removeKb())
    return
  }

  if (!isAuthorized(chatId)) return

  if (text === '/help') {
    await botInstance.sendMessage(chatId, HELP_TEXT, removeKb())
    return
  }

  if (text === '/entrate') {
    await botInstance.sendMessage(chatId, entrateText(), removeKb())
    return
  }

  if (text === '/uscite') {
    await botInstance.sendMessage(chatId, usciteText(), removeKb())
    return
  }

  if (text === '/investimenti') {
    await botInstance.sendMessage(chatId, investimentiText(), removeKb())
    return
  }

  if (text === '/trasferimenti') {
    await botInstance.sendMessage(chatId, trasferimentiText(), removeKb())
    return
  }

  if (await tryHandleSchemaMessage(msg)) return

  await botInstance.sendMessage(chatId, 'Comando non riconosciuto. Invia /help per vedere degli esempi.', removeKb())
}

// ===================== PUBLIC API =====================

function startBot(token, windowRef) {
  if (botInstance) {
    stopBot()
  }
  win = windowRef
  botInstance = new TelegramBot(token, { polling: true })
  botInstance.on('message', (msg) => handleMessage(msg).catch((err) => console.error('Telegram message error:', err)))
  botInstance.on('polling_error', (err) => console.error('Telegram polling error:', err.message))
}

function stopBot() {
  if (botInstance) {
    botInstance.stopPolling()
    botInstance = null
  }
}

function isRunning() {
  return botInstance !== null
}

module.exports = { startBot, stopBot, isRunning }
