const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')
const { v4: uuidv4 } = require('uuid')

function resolveDbPath() {
  const dataDir = path.join(__dirname, '..', 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  return path.join(dataDir, 'gekko-runway.db')
}

const dbPath = resolveDbPath()
let db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  initial_balance REAL NOT NULL DEFAULT 0,
  saveback_enabled INTEGER NOT NULL DEFAULT 0,
  saveback_percent REAL NOT NULL DEFAULT 0,
  roundup_enabled INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT '#A8D5BA',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('entrata','uscita')),
  UNIQUE(name, type)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('entrata','uscita','trasferimento')),
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  to_account_id INTEGER REFERENCES accounts(id),
  tag TEXT,
  note TEXT,
  roundup REAL NOT NULL DEFAULT 0,
  saveback REAL NOT NULL DEFAULT 0,
  include_in_forecast INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'app' CHECK(source IN ('app','telegram')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset_tax_rates (
  type TEXT PRIMARY KEY,
  rate REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS investments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  asset_name TEXT NOT NULL,
  tag TEXT NOT NULL,
  account_id INTEGER REFERENCES accounts(id),
  transaction_id INTEGER REFERENCES transactions(id),
  buy_price REAL NOT NULL,
  amount_invested REAL NOT NULL,
  target_price REAL,
  tax_rate REAL NOT NULL,
  date TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'app' CHECK(source IN ('app','telegram')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  frequency TEXT NOT NULL CHECK(frequency IN ('mensile','annuale')),
  day_of_month INTEGER NOT NULL CHECK(day_of_month BETWEEN 1 AND 31),
  month_of_year INTEGER CHECK(month_of_year BETWEEN 1 AND 12),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (frequency = 'mensile' OR month_of_year IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_investments_date ON investments(date);
`)

// --- Migrazione: aggiunge account_id a investments se il DB esisteva già senza questa colonna ---
const investmentColumns = db.prepare('PRAGMA table_info(investments)').all().map((c) => c.name)
if (!investmentColumns.includes('account_id')) {
  db.exec('ALTER TABLE investments ADD COLUMN account_id INTEGER REFERENCES accounts(id)')
}

// --- Migrazione: aggiunge transaction_id a investments (collega l'investimento alla transazione di acquisto) ---
if (!investmentColumns.includes('transaction_id')) {
  db.exec('ALTER TABLE investments ADD COLUMN transaction_id INTEGER REFERENCES transactions(id)')
}

// --- Migrazione: aggiunge start_date/end_date a recurring_expenses se il DB esisteva già senza queste colonne ---
const recurringExpenseColumns = db.prepare('PRAGMA table_info(recurring_expenses)').all().map((c) => c.name)
if (!recurringExpenseColumns.includes('start_date')) {
  db.exec('ALTER TABLE recurring_expenses ADD COLUMN start_date TEXT')
  db.exec("UPDATE recurring_expenses SET start_date = date(created_at) WHERE start_date IS NULL")
}
if (!recurringExpenseColumns.includes('end_date')) {
  db.exec('ALTER TABLE recurring_expenses ADD COLUMN end_date TEXT')
}

// --- Migrazione: aggiunge roundup_enabled/active ad accounts se il DB esisteva già senza queste colonne ---
const accountColumns = db.prepare('PRAGMA table_info(accounts)').all().map((c) => c.name)
if (!accountColumns.includes('roundup_enabled')) {
  db.exec('ALTER TABLE accounts ADD COLUMN roundup_enabled INTEGER NOT NULL DEFAULT 0')
}
if (!accountColumns.includes('active')) {
  db.exec('ALTER TABLE accounts ADD COLUMN active INTEGER NOT NULL DEFAULT 1')
}

// --- Migrazione: aggiunge to_account_id a transactions se il DB esisteva già senza questa colonna ---
const transactionColumns = db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name)
if (!transactionColumns.includes('to_account_id')) {
  db.exec('ALTER TABLE transactions ADD COLUMN to_account_id INTEGER REFERENCES accounts(id)')
}
db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_to_account ON transactions(to_account_id)')

// --- Migrazione: estende il CHECK su transactions.type per includere 'trasferimento' ---
// SQLite non supporta l'alterazione di un CHECK esistente: la tabella va ricreata.
const transactionsTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'").get().sql
if (!transactionsTableSql.includes('trasferimento')) {
  // Vanno disattivati ENTRAMBI questi pragma prima di rinominare la tabella: altrimenti
  // ALTER TABLE RENAME riscrive automaticamente le FK di altre tabelle (es.
  // investments.transaction_id) facendole puntare a "transactions_old", che viene poi
  // eliminata, corrompendo lo schema. Nessuno dei due pragma da solo è sufficiente
  // (verificato empiricamente): servono entrambi insieme.
  db.pragma('foreign_keys = OFF')
  db.pragma('legacy_alter_table = ON')
  const rebuildTransactionsTable = db.transaction(() => {
    db.exec('ALTER TABLE transactions RENAME TO transactions_old')
    db.exec(`
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL CHECK(type IN ('entrata','uscita','trasferimento')),
        date TEXT NOT NULL,
        amount REAL NOT NULL,
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        to_account_id INTEGER REFERENCES accounts(id),
        tag TEXT,
        note TEXT,
        roundup REAL NOT NULL DEFAULT 0,
        saveback REAL NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'app' CHECK(source IN ('app','telegram')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    db.exec(`
      INSERT INTO transactions (id, uuid, type, date, amount, account_id, to_account_id, tag, note, roundup, saveback, source, created_at)
      SELECT id, uuid, type, date, amount, account_id, to_account_id, tag, note, roundup, saveback, source, created_at
      FROM transactions_old
    `)
    db.exec('DROP TABLE transactions_old')
    db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_to_account ON transactions(to_account_id)')
  })
  rebuildTransactionsTable()
  db.pragma('legacy_alter_table = OFF')
  db.pragma('foreign_keys = ON')
}

// --- Migrazione: aggiunge include_in_forecast a transactions se il DB esisteva già senza questa colonna ---
if (!db.prepare('PRAGMA table_info(transactions)').all().map((c) => c.name).includes('include_in_forecast')) {
  db.exec('ALTER TABLE transactions ADD COLUMN include_in_forecast INTEGER NOT NULL DEFAULT 1')
}

// --- Seed idempotente ---
const seedTags = db.prepare('INSERT OR IGNORE INTO tags (name, type) VALUES (?, ?)')
const seedTagsTx = db.transaction(() => {
  ;['Stipendio', 'Regalo', 'Rimborso', 'Interessi', 'Investimenti', 'Altro'].forEach((n) => seedTags.run(n, 'entrata'))
  ;['Cibo', 'Trasporti', 'Casa', 'Svago', 'Salute', 'Investimenti', 'Altro'].forEach((n) => seedTags.run(n, 'uscita'))
})
seedTagsTx()

const seedRate = db.prepare('INSERT OR IGNORE INTO asset_tax_rates (type, rate) VALUES (?, ?)')
const seedRatesTx = db.transaction(() => {
  seedRate.run('crypto', 33)
  seedRate.run('azioni', 26)
  seedRate.run('obbligazioni', 12.5)
  seedRate.run('etf', 26)
  seedRate.run('altro', 26)
})
seedRatesTx()

db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'light')").run()

// ===================== ACCOUNTS =====================

const accountBalanceExpr = `
  a.initial_balance
  + COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id AND type = 'entrata'), 0)
  - COALESCE((SELECT SUM(amount + roundup + saveback) FROM transactions WHERE account_id = a.id AND type = 'uscita'), 0)
  - COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = a.id AND type = 'trasferimento'), 0)
  + COALESCE((SELECT SUM(amount) FROM transactions WHERE to_account_id = a.id AND type = 'trasferimento'), 0)
`

function getAccounts() {
  return db.prepare(`SELECT a.*, (${accountBalanceExpr}) AS balance FROM accounts a ORDER BY a.created_at ASC`).all()
}

function getAccountBalance(accountId) {
  const row = db.prepare(`SELECT (${accountBalanceExpr}) AS balance FROM accounts a WHERE a.id = ?`).get(accountId)
  return row ? row.balance : null
}

function createAccount({
  name,
  initial_balance = 0,
  saveback_enabled = false,
  saveback_percent = 0,
  roundup_enabled = false,
  color = '#A8D5BA'
}) {
  const info = db
    .prepare(
      'INSERT INTO accounts (name, initial_balance, saveback_enabled, saveback_percent, roundup_enabled, color) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(name, initial_balance, saveback_enabled ? 1 : 0, saveback_percent, roundup_enabled ? 1 : 0, color)
  return db.prepare(`SELECT a.*, (${accountBalanceExpr}) AS balance FROM accounts a WHERE a.id = ?`).get(info.lastInsertRowid)
}

const ACCOUNT_BOOLEAN_FIELDS = ['saveback_enabled', 'roundup_enabled', 'active']

function updateAccount(id, fields) {
  const allowed = ['name', 'initial_balance', 'saveback_enabled', 'saveback_percent', 'roundup_enabled', 'active', 'color']
  const keys = Object.keys(fields).filter((k) => allowed.includes(k))
  if (keys.length === 0) return db.prepare(`SELECT a.*, (${accountBalanceExpr}) AS balance FROM accounts a WHERE a.id = ?`).get(id)
  const setClause = keys.map((k) => `${k} = ?`).join(', ')
  const values = keys.map((k) => (ACCOUNT_BOOLEAN_FIELDS.includes(k) ? (fields[k] ? 1 : 0) : fields[k]))
  db.prepare(`UPDATE accounts SET ${setClause} WHERE id = ?`).run(...values, id)
  return db.prepare(`SELECT a.*, (${accountBalanceExpr}) AS balance FROM accounts a WHERE a.id = ?`).get(id)
}

function deleteAccount(id) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM transactions WHERE account_id = ?').run(id)
    db.prepare('DELETE FROM investments WHERE account_id = ?').run(id)
    db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
  })
  tx()
  return { success: true }
}

function getBalanceHistory(accountId) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId)
  if (!account) return []
  const rows = db
    .prepare(
      `SELECT date, id, type, amount, roundup, saveback, account_id, to_account_id FROM transactions
       WHERE account_id = ? OR (to_account_id = ? AND type = 'trasferimento')
       ORDER BY date ASC, id ASC`
    )
    .all(accountId, accountId)
  let running = account.initial_balance
  return rows.map((r) => {
    if (r.type === 'entrata') running += r.amount
    else if (r.type === 'uscita') running -= r.amount + r.roundup + r.saveback
    else if (r.type === 'trasferimento' && r.account_id === accountId) running -= r.amount
    else if (r.type === 'trasferimento' && r.to_account_id === accountId) running += r.amount
    return { date: r.date, balance: running }
  })
}

// ===================== TAGS =====================

function getTags(type) {
  if (type) return db.prepare('SELECT * FROM tags WHERE type = ? ORDER BY name ASC').all(type)
  return db.prepare('SELECT * FROM tags ORDER BY type ASC, name ASC').all()
}

function createTag({ name, type }) {
  const info = db.prepare('INSERT OR IGNORE INTO tags (name, type) VALUES (?, ?)').run(name, type)
  if (info.changes === 0) {
    return db.prepare('SELECT * FROM tags WHERE name = ? AND type = ?').get(name, type)
  }
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(info.lastInsertRowid)
}

function deleteTag(id) {
  db.prepare('DELETE FROM tags WHERE id = ?').run(id)
  return { success: true }
}

// ===================== TRANSACTIONS =====================

function getTransactions(filters = {}) {
  const clauses = []
  const params = []
  if (filters.type) {
    clauses.push('type = ?')
    params.push(filters.type)
  }
  if (filters.accountId) {
    clauses.push(`(account_id = ? OR (to_account_id = ? AND type = 'trasferimento'))`)
    params.push(filters.accountId, filters.accountId)
  }
  if (filters.tag) {
    clauses.push('tag = ?')
    params.push(filters.tag)
  }
  if (filters.dateFrom) {
    clauses.push('date >= ?')
    params.push(filters.dateFrom)
  }
  if (filters.dateTo) {
    clauses.push('date <= ?')
    params.push(filters.dateTo)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return db.prepare(`SELECT * FROM transactions ${where} ORDER BY date DESC, id DESC`).all(...params)
}

function createTransaction(data) {
  const uuid = data.uuid || uuidv4()
  const info = db
    .prepare(
      `INSERT INTO transactions (uuid, type, date, amount, account_id, to_account_id, tag, note, roundup, saveback, include_in_forecast, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      uuid,
      data.type,
      data.date,
      data.amount,
      data.account_id,
      data.to_account_id || null,
      data.tag || null,
      data.note || null,
      data.roundup || 0,
      data.saveback || 0,
      data.include_in_forecast === false ? 0 : 1,
      data.source || 'app'
    )
  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(info.lastInsertRowid)
}

const TRANSACTION_BOOLEAN_FIELDS = ['include_in_forecast']

function updateTransaction(id, fields) {
  const allowed = ['type', 'date', 'amount', 'account_id', 'to_account_id', 'tag', 'note', 'roundup', 'saveback', 'include_in_forecast']
  const keys = Object.keys(fields).filter((k) => allowed.includes(k))
  if (keys.length === 0) return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
  const setClause = keys.map((k) => `${k} = ?`).join(', ')
  const values = keys.map((k) => (TRANSACTION_BOOLEAN_FIELDS.includes(k) ? (fields[k] ? 1 : 0) : fields[k]))
  db.prepare(`UPDATE transactions SET ${setClause} WHERE id = ?`).run(...values, id)
  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)
}

function deleteTransaction(id) {
  db.prepare('DELETE FROM transactions WHERE id = ?').run(id)
  return { success: true }
}

// ===================== ASSET TAX RATES =====================

function getAssetTaxRates() {
  return db.prepare('SELECT * FROM asset_tax_rates ORDER BY type ASC').all()
}

function upsertAssetTaxRate({ type, rate }) {
  db.prepare('INSERT INTO asset_tax_rates (type, rate) VALUES (?, ?) ON CONFLICT(type) DO UPDATE SET rate = excluded.rate').run(
    type,
    rate
  )
  return db.prepare('SELECT * FROM asset_tax_rates WHERE type = ?').get(type)
}

// ===================== INVESTMENTS =====================

function computeInvestmentMetrics(inv) {
  const quantita = inv.amount_invested / inv.buy_price
  if (inv.target_price == null) {
    return {
      ...inv,
      quantita,
      valore_al_target: null,
      plusvalenza_lorda: null,
      tasse: null,
      plusvalenza_netta: null,
      rendimento_netto_pct: null
    }
  }
  const valore_al_target = quantita * inv.target_price
  const plusvalenza_lorda = valore_al_target - inv.amount_invested
  const tasse = plusvalenza_lorda > 0 ? plusvalenza_lorda * (inv.tax_rate / 100) : 0
  const plusvalenza_netta = plusvalenza_lorda - tasse
  const rendimento_netto_pct = (plusvalenza_netta / inv.amount_invested) * 100
  return { ...inv, quantita, valore_al_target, plusvalenza_lorda, tasse, plusvalenza_netta, rendimento_netto_pct }
}

function getInvestments() {
  const rows = db.prepare('SELECT * FROM investments ORDER BY date DESC, id DESC').all()
  return rows.map(computeInvestmentMetrics)
}

function createInvestment(data) {
  const uuid = data.uuid || uuidv4()
  let tax_rate = data.tax_rate
  if (tax_rate == null) {
    const rateRow = db.prepare('SELECT rate FROM asset_tax_rates WHERE type = ?').get(data.tag)
    tax_rate = rateRow ? rateRow.rate : 0
  }
  const createTx = db.transaction(() => {
    const buyTransaction = createTransaction({
      type: 'uscita',
      date: data.date,
      amount: data.amount_invested,
      account_id: data.account_id,
      tag: 'Investimenti',
      note: `Acquisto investimento: ${data.asset_name}`,
      source: data.source || 'app'
    })
    const info = db
      .prepare(
        `INSERT INTO investments (uuid, asset_name, tag, account_id, transaction_id, buy_price, amount_invested, target_price, tax_rate, date, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        uuid,
        data.asset_name,
        data.tag,
        data.account_id,
        buyTransaction.id,
        data.buy_price,
        data.amount_invested,
        data.target_price == null ? null : data.target_price,
        tax_rate,
        data.date,
        data.source || 'app'
      )
    return info.lastInsertRowid
  })
  const newId = createTx()
  const row = db.prepare('SELECT * FROM investments WHERE id = ?').get(newId)
  return computeInvestmentMetrics(row)
}

function updateInvestment(id, fields) {
  const allowed = ['asset_name', 'tag', 'account_id', 'buy_price', 'amount_invested', 'target_price', 'tax_rate', 'date']
  const keys = Object.keys(fields).filter((k) => allowed.includes(k))
  const existing = db.prepare('SELECT * FROM investments WHERE id = ?').get(id)
  const updateTx = db.transaction(() => {
    if (keys.length > 0) {
      const setClause = keys.map((k) => `${k} = ?`).join(', ')
      const values = keys.map((k) => fields[k])
      db.prepare(`UPDATE investments SET ${setClause} WHERE id = ?`).run(...values, id)
    }
    if (existing && existing.transaction_id) {
      const txFields = {}
      if ('account_id' in fields) txFields.account_id = fields.account_id
      if ('amount_invested' in fields) txFields.amount = fields.amount_invested
      if ('date' in fields) txFields.date = fields.date
      if ('asset_name' in fields) txFields.note = `Acquisto investimento: ${fields.asset_name}`
      if (Object.keys(txFields).length > 0) updateTransaction(existing.transaction_id, txFields)
    }
  })
  updateTx()
  const row = db.prepare('SELECT * FROM investments WHERE id = ?').get(id)
  return computeInvestmentMetrics(row)
}

function deleteInvestment(id) {
  const existing = db.prepare('SELECT * FROM investments WHERE id = ?').get(id)
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM investments WHERE id = ?').run(id)
    if (existing && existing.transaction_id) {
      db.prepare('DELETE FROM transactions WHERE id = ?').run(existing.transaction_id)
    }
  })
  tx()
  return { success: true }
}

function liquidateInvestments(ids, { amount, date, note }) {
  const investments = ids.map((invId) => db.prepare('SELECT * FROM investments WHERE id = ?').get(invId)).filter(Boolean)
  if (investments.length === 0) throw new Error('Nessun investimento selezionato')
  const accountIds = [...new Set(investments.map((i) => i.account_id))]
  if (accountIds.length > 1) throw new Error('Gli investimenti selezionati devono appartenere allo stesso conto')
  const accountId = accountIds[0]
  if (accountId == null) throw new Error('Conto di riferimento mancante per gli investimenti selezionati')

  const assetNames = investments.map((i) => i.asset_name).join(', ')
  const liquidateTx = db.transaction(() => {
    const saleTransaction = createTransaction({
      type: 'entrata',
      date,
      amount,
      account_id: accountId,
      tag: 'Investimenti',
      note: note || `Liquidazione investimento: ${assetNames}`,
      source: 'app'
    })
    investments.forEach((inv) => {
      db.prepare('DELETE FROM investments WHERE id = ?').run(inv.id)
    })
    return saleTransaction
  })
  return liquidateTx()
}

function getPortfolioComposition() {
  return db
    .prepare('SELECT tag, SUM(amount_invested) AS total FROM investments GROUP BY tag ORDER BY total DESC')
    .all()
}

// ===================== RECURRING EXPENSES =====================

function computeRecurringExpenseTotal(r) {
  if (!r.end_date) return null
  if (r.frequency === 'mensile') {
    const [sy, sm] = r.start_date.split('-').map(Number)
    const [ey, em] = r.end_date.split('-').map(Number)
    const months = (ey - sy) * 12 + (em - sm) + 1
    return months > 0 ? months * r.amount : 0
  }
  const startMonth = r.start_date.slice(0, 7)
  const endMonth = r.end_date.slice(0, 7)
  const sy = Number(r.start_date.slice(0, 4))
  const ey = Number(r.end_date.slice(0, 4))
  let occurrences = 0
  for (let y = sy; y <= ey; y++) {
    const occMonth = `${y}-${String(r.month_of_year).padStart(2, '0')}`
    if (occMonth >= startMonth && occMonth <= endMonth) occurrences++
  }
  return occurrences * r.amount
}

function getRecurringExpenses() {
  const rows = db.prepare('SELECT * FROM recurring_expenses ORDER BY active DESC, name ASC').all()
  return rows.map((r) => ({ ...r, totale: computeRecurringExpenseTotal(r) }))
}

function createRecurringExpense(data) {
  const uuid = data.uuid || uuidv4()
  const info = db
    .prepare(
      `INSERT INTO recurring_expenses (uuid, name, amount, frequency, day_of_month, month_of_year, active, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      uuid,
      data.name,
      data.amount,
      data.frequency,
      data.day_of_month,
      data.frequency === 'annuale' ? data.month_of_year : null,
      data.active === false ? 0 : 1,
      data.start_date || new Date().toISOString().slice(0, 10),
      data.end_date || null
    )
  const row = db.prepare('SELECT * FROM recurring_expenses WHERE id = ?').get(info.lastInsertRowid)
  return { ...row, totale: computeRecurringExpenseTotal(row) }
}

function updateRecurringExpense(id, fields) {
  const allowed = ['name', 'amount', 'frequency', 'day_of_month', 'month_of_year', 'active', 'start_date', 'end_date']
  const keys = Object.keys(fields).filter((k) => allowed.includes(k))
  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(', ')
    const values = keys.map((k) => (k === 'active' ? (fields[k] ? 1 : 0) : fields[k]))
    db.prepare(`UPDATE recurring_expenses SET ${setClause} WHERE id = ?`).run(...values, id)
  }
  const row = db.prepare('SELECT * FROM recurring_expenses WHERE id = ?').get(id)
  return { ...row, totale: computeRecurringExpenseTotal(row) }
}

function deleteRecurringExpense(id) {
  db.prepare('DELETE FROM recurring_expenses WHERE id = ?').run(id)
  return { success: true }
}

// ===================== FORECAST =====================

function getForecastEndDate() {
  const stored = getSetting('forecast_end_date')
  if (stored) return stored
  const d = new Date()
  d.setMonth(d.getMonth() + 12)
  return d.toISOString().slice(0, 10)
}

function getForecastStartDate() {
  // A differenza della data di fine, qui l'assenza del setting non ha un default calcolato:
  // significa "nessun limite", cioè considera tutto lo storico (comportamento pre-esistente).
  return getSetting('forecast_start_date') || null
}

function getForecast() {
  const startDateStr = getForecastStartDate()
  const endDateStr = getForecastEndDate()
  const today = new Date()
  const end = new Date(endDateStr)
  const months = Math.max(
    1,
    (end.getFullYear() - today.getFullYear()) * 12 + (end.getMonth() - today.getMonth())
  )

  const row = startDateStr
    ? db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) AS total,
                  COUNT(DISTINCT strftime('%Y-%m', date)) AS monthCount
           FROM transactions WHERE type = 'uscita' AND include_in_forecast = 1 AND date >= ?`
        )
        .get(startDateStr)
    : db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) AS total,
                  COUNT(DISTINCT strftime('%Y-%m', date)) AS monthCount
           FROM transactions WHERE type = 'uscita' AND include_in_forecast = 1`
        )
        .get()
  const avgMonthlyExpense = row.monthCount > 0 ? row.total / row.monthCount : 0

  const recurring = db.prepare('SELECT * FROM recurring_expenses WHERE active = 1').all()
  const balanceRow = db.prepare(`SELECT COALESCE(SUM(${accountBalanceExpr}), 0) AS total FROM accounts a`).get()
  let running = balanceRow.total

  const result = []
  for (let i = 1; i <= months; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
    const monthLabel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    let recurringTotal = 0
    recurring.forEach((r) => {
      if (r.start_date && r.start_date.slice(0, 7) > monthLabel) return
      if (r.end_date && r.end_date.slice(0, 7) < monthLabel) return
      if (r.frequency === 'mensile') recurringTotal += r.amount
      else if (r.month_of_year === d.getMonth() + 1) recurringTotal += r.amount
    })
    const projectedExpense = avgMonthlyExpense + recurringTotal
    running -= projectedExpense
    result.push({ month: monthLabel, projectedExpense, recurringTotal, projectedBalance: running })
  }
  return { avgMonthlyExpense, startDate: startDateStr, endDate: endDateStr, endBalance: running, months: result }
}

// ===================== SALVADANAIO =====================

function getSalvadanaio() {
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(roundup),0) AS totalRoundup, COALESCE(SUM(saveback),0) AS totalSaveback FROM transactions WHERE type = 'uscita'"
    )
    .get()
  return row
}

// ===================== HEATMAP =====================

function getHeatmapData(year) {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  const entrate = db
    .prepare("SELECT date, SUM(amount) AS total FROM transactions WHERE type = 'entrata' AND date BETWEEN ? AND ? GROUP BY date")
    .all(from, to)
  // Le uscite generate automaticamente dall'acquisto di un investimento (transazione collegata
  // a investments.transaction_id) vengono escluse solo qui: nella heatmap devono comparire
  // esclusivamente come "investimento", non anche come "uscita" (altrimenti risulterebbero
  // conteggiate due volte nello stesso giorno). Altrove (elenco movimenti, saldo conto,
  // salvadanaio) restano invariate perché rappresentano un reale movimento di denaro.
  const uscite = db
    .prepare(
      `SELECT date, SUM(amount) AS total FROM transactions
       WHERE type = 'uscita' AND date BETWEEN ? AND ?
         AND id NOT IN (SELECT transaction_id FROM investments WHERE transaction_id IS NOT NULL)
       GROUP BY date`
    )
    .all(from, to)
  const investimenti = db
    .prepare('SELECT date, SUM(amount_invested) AS total FROM investments WHERE date BETWEEN ? AND ? GROUP BY date')
    .all(from, to)

  const byDate = {}
  const ensure = (date) => {
    if (!byDate[date]) byDate[date] = { date, entrata: 0, uscita: 0, investimento: 0 }
    return byDate[date]
  }
  entrate.forEach((r) => (ensure(r.date).entrata = r.total))
  uscite.forEach((r) => (ensure(r.date).uscita = r.total))
  investimenti.forEach((r) => (ensure(r.date).investimento = r.total))

  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
}

// ===================== SETTINGS =====================

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : null
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value
  )
  return { success: true }
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const obj = {}
  rows.forEach((r) => (obj[r.key] = r.value))
  return obj
}

function resetDatabase() {
  const tx = db.transaction(() => {
    db.exec('DELETE FROM investments')
    db.exec('DELETE FROM transactions')
    db.exec('DELETE FROM accounts')
    db.exec('DELETE FROM tags')
    db.exec('DELETE FROM asset_tax_rates')
    db.exec('DELETE FROM settings')
    db.exec('DELETE FROM recurring_expenses')
  })
  tx()
  seedTagsTx()
  seedRatesTx()
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'light')").run()
  return { success: true }
}

// ===================== BACKUP (EXPORT/IMPORT) =====================

const REQUIRED_TABLES = ['accounts', 'transactions', 'investments', 'tags', 'asset_tax_rates', 'settings', 'recurring_expenses']

function exportDatabaseTo(destPath) {
  db.pragma('wal_checkpoint(TRUNCATE)')
  fs.copyFileSync(dbPath, destPath)
  return { success: true, path: destPath }
}

function importDatabaseFrom(srcPath) {
  let testDb
  try {
    testDb = new Database(srcPath, { readonly: true, fileMustExist: true })
    const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name)
    const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t))
    if (missing.length > 0) {
      throw new Error(`File non valido: mancano le tabelle ${missing.join(', ')}`)
    }
  } finally {
    if (testDb) testDb.close()
  }

  db.pragma('wal_checkpoint(TRUNCATE)')
  db.close()
  fs.copyFileSync(srcPath, dbPath)
  for (const suffix of ['-wal', '-shm']) {
    try {
      fs.unlinkSync(dbPath + suffix)
    } catch (err) {
      // nessun file da rimuovere, ignora
    }
  }
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return { success: true }
}

module.exports = {
  accounts: { getAccounts, getAccountBalance, createAccount, updateAccount, deleteAccount, getBalanceHistory },
  tags: { getTags, createTag, deleteTag },
  transactions: { getTransactions, createTransaction, updateTransaction, deleteTransaction },
  assetTaxRates: { getAssetTaxRates, upsertAssetTaxRate },
  investments: { getInvestments, createInvestment, updateInvestment, deleteInvestment, liquidateInvestments, getPortfolioComposition },
  recurringExpenses: { getRecurringExpenses, createRecurringExpense, updateRecurringExpense, deleteRecurringExpense },
  forecast: { getForecast },
  salvadanaio: { getSalvadanaio },
  heatmap: { getHeatmapData },
  settings: { getSetting, setSetting, getAllSettings, resetDatabase },
  backup: { exportDatabaseTo, importDatabaseFrom }
}
