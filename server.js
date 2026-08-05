const path = require('path')
const fs = require('fs')
const os = require('os')
const express = require('express')
const db = require('./server/db')

const app = express()

// --- Notifica live (SSE): avvisa i client connessi quando i dati cambiano ---
const sseClients = new Set()

function broadcastDataChanged(entity, source) {
  const payload = `data: ${JSON.stringify({ entity, source })}\n\n`
  for (const res of sseClients) res.write(payload)
}

// --- Auto-spegnimento per inattività: resetta il timer ad ogni richiesta ---
const IDLE_MINUTES = Number(process.env.IDLE_SHUTDOWN_MINUTES || 15)
let idleTimer = null

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer)
  if (IDLE_MINUTES <= 0) return
  idleTimer = setTimeout(() => {
    console.log(`Nessuna attività da ${IDLE_MINUTES} minuti, arresto del processo.`)
    process.exit(0)
  }, IDLE_MINUTES * 60 * 1000)
}

app.use((req, res, next) => {
  resetIdleTimer()
  next()
})

app.use(express.json({ limit: '2mb' }))

// --- Tabella canali: unica fonte di verità per le operazioni su db.js ---
const channels = {
  'accounts:getAll': () => db.accounts.getAccounts(),
  'accounts:create': (payload) => {
    const result = db.accounts.createAccount(payload)
    broadcastDataChanged('accounts', 'app')
    return result
  },
  'accounts:update': ({ id, fields }) => {
    const result = db.accounts.updateAccount(id, fields)
    broadcastDataChanged('accounts', 'app')
    return result
  },
  'accounts:delete': ({ id }) => {
    const result = db.accounts.deleteAccount(id)
    broadcastDataChanged('accounts', 'app')
    broadcastDataChanged('transactions', 'app')
    broadcastDataChanged('investments', 'app')
    return result
  },
  'accounts:getBalanceHistory': ({ accountId }) => db.accounts.getBalanceHistory(accountId),

  'tags:getAll': (payload) => db.tags.getTags(payload && payload.type),
  'tags:create': (payload) => {
    const result = db.tags.createTag(payload)
    broadcastDataChanged('tags', 'app')
    return result
  },
  'tags:delete': ({ id }) => {
    const result = db.tags.deleteTag(id)
    broadcastDataChanged('tags', 'app')
    return result
  },

  'transactions:getAll': (filters) => db.transactions.getTransactions(filters || {}),
  'transactions:create': (payload) => {
    const result = db.transactions.createTransaction({ ...payload, source: 'app' })
    broadcastDataChanged('transactions', 'app')
    return result
  },
  'transactions:update': ({ id, fields }) => {
    const result = db.transactions.updateTransaction(id, fields)
    broadcastDataChanged('transactions', 'app')
    return result
  },
  'transactions:delete': ({ id }) => {
    const result = db.transactions.deleteTransaction(id)
    broadcastDataChanged('transactions', 'app')
    return result
  },

  'investments:getAll': () => db.investments.getInvestments(),
  'investments:create': (payload) => {
    const result = db.investments.createInvestment({ ...payload, source: 'app' })
    broadcastDataChanged('investments', 'app')
    broadcastDataChanged('transactions', 'app')
    return result
  },
  'investments:update': ({ id, fields }) => {
    const result = db.investments.updateInvestment(id, fields)
    broadcastDataChanged('investments', 'app')
    broadcastDataChanged('transactions', 'app')
    return result
  },
  'investments:delete': ({ id }) => {
    const result = db.investments.deleteInvestment(id)
    broadcastDataChanged('investments', 'app')
    broadcastDataChanged('transactions', 'app')
    return result
  },
  'investments:liquidate': ({ ids, amount, date, note }) => {
    const result = db.investments.liquidateInvestments(ids, { amount, date, note })
    broadcastDataChanged('investments', 'app')
    broadcastDataChanged('transactions', 'app')
    return result
  },
  'investments:getPortfolioComposition': () => db.investments.getPortfolioComposition(),

  'recurringExpenses:getAll': () => db.recurringExpenses.getRecurringExpenses(),
  'recurringExpenses:create': (payload) => {
    const result = db.recurringExpenses.createRecurringExpense(payload)
    broadcastDataChanged('recurringExpenses', 'app')
    return result
  },
  'recurringExpenses:update': ({ id, fields }) => {
    const result = db.recurringExpenses.updateRecurringExpense(id, fields)
    broadcastDataChanged('recurringExpenses', 'app')
    return result
  },
  'recurringExpenses:delete': ({ id }) => {
    const result = db.recurringExpenses.deleteRecurringExpense(id)
    broadcastDataChanged('recurringExpenses', 'app')
    return result
  },

  'forecast:getData': () => db.forecast.getForecast(),

  'assetTaxRates:getAll': () => db.assetTaxRates.getAssetTaxRates(),
  'assetTaxRates:upsert': (payload) => {
    const result = db.assetTaxRates.upsertAssetTaxRate(payload)
    broadcastDataChanged('assetTaxRates', 'app')
    return result
  },

  'salvadanaio:get': () => db.salvadanaio.getSalvadanaio(),

  'heatmap:getData': ({ year }) => db.heatmap.getHeatmapData(year),

  'settings:getAll': () => db.settings.getAllSettings(),
  'settings:set': ({ key, value }) => {
    const result = db.settings.setSetting(key, value)
    broadcastDataChanged('settings', 'app')
    return result
  },
  'settings:resetDatabase': () => {
    const result = db.settings.resetDatabase()
    broadcastDataChanged('accounts', 'app')
    broadcastDataChanged('transactions', 'app')
    broadcastDataChanged('investments', 'app')
    broadcastDataChanged('tags', 'app')
    broadcastDataChanged('assetTaxRates', 'app')
    broadcastDataChanged('settings', 'app')
    broadcastDataChanged('recurringExpenses', 'app')
    return result
  }
  // settings:exportDatabase / settings:importDatabase non sono canali generici:
  // richiedono semantica HTTP reale (download/upload di file binari), vedi route dedicate sotto.
}

app.get('/api/gekko-runway/data', (req, res) => {
  const { channel } = req.query
  const payload = req.query.payload ? JSON.parse(req.query.payload) : undefined
  if (!channels[channel]) return res.status(404).json({ error: 'unknown channel' })
  try {
    res.json(channels[channel](payload))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/gekko-runway/data', (req, res) => {
  const { channel, payload } = req.body
  if (!channels[channel]) return res.status(404).json({ error: 'unknown channel' })
  try {
    res.json(channels[channel](payload))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Export / import database ---
app.get('/api/gekko-runway/export', (req, res) => {
  const filename = `gekko-runway-backup-${new Date().toISOString().slice(0, 10)}.db`
  const tmpPath = path.join(os.tmpdir(), `gekko-runway-export-${Date.now()}.db`)
  try {
    db.backup.exportDatabaseTo(tmpPath)
    res.download(tmpPath, filename, (err) => {
      fs.unlink(tmpPath, () => {})
      if (err) console.error('Errore invio export:', err.message)
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post(
  '/api/gekko-runway/import',
  express.raw({ type: 'application/octet-stream', limit: '50mb' }),
  (req, res) => {
    const tmpPath = path.join(os.tmpdir(), `gekko-runway-import-${Date.now()}.db`)
    try {
      fs.writeFileSync(tmpPath, req.body)
      const importResult = db.backup.importDatabaseFrom(tmpPath)
      broadcastDataChanged('accounts', 'app')
      broadcastDataChanged('transactions', 'app')
      broadcastDataChanged('investments', 'app')
      broadcastDataChanged('tags', 'app')
      broadcastDataChanged('assetTaxRates', 'app')
      broadcastDataChanged('settings', 'app')
      broadcastDataChanged('recurringExpenses', 'app')
      res.json(importResult)
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    } finally {
      fs.unlink(tmpPath, () => {})
    }
  }
)

// --- Live-refresh (SSE) ---
app.get('/api/gekko-runway/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  res.write('\n')
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})

// --- Frontend statico (build Vite, path già relativi) ---
app.use(express.static(path.join(__dirname, 'dist')))

// --- Avvio: socket activation systemd se presente, altrimenti porta diretta per test manuale ---
const PORT = process.env.PORT || 3000

function startServer() {
  if (process.env.LISTEN_FDS) {
    app.listen({ fd: 3 }, () => {
      console.log('Gekko-Runway in ascolto su socket systemd (fd 3)')
    })
  } else {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Gekko-Runway in ascolto su http://0.0.0.0:${PORT}`)
    })
  }
}

startServer()
resetIdleTimer()
