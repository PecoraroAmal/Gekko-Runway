const path = require('path')
const { app, BrowserWindow, ipcMain, dialog } = require('electron')

let win = null
let db = null
let bot = null

function notifyDataChanged(entity, source) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('data-changed', { entity, source })
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

function registerIpcHandlers() {
  // accounts
  ipcMain.handle('accounts:getAll', () => db.accounts.getAccounts())
  ipcMain.handle('accounts:create', (_e, payload) => {
    const result = db.accounts.createAccount(payload)
    notifyDataChanged('accounts', 'app')
    return result
  })
  ipcMain.handle('accounts:update', (_e, { id, fields }) => {
    const result = db.accounts.updateAccount(id, fields)
    notifyDataChanged('accounts', 'app')
    return result
  })
  ipcMain.handle('accounts:delete', (_e, { id }) => {
    const result = db.accounts.deleteAccount(id)
    notifyDataChanged('accounts', 'app')
    notifyDataChanged('transactions', 'app')
    notifyDataChanged('investments', 'app')
    return result
  })
  ipcMain.handle('accounts:getBalanceHistory', (_e, { accountId }) => db.accounts.getBalanceHistory(accountId))

  // tags
  ipcMain.handle('tags:getAll', (_e, payload) => db.tags.getTags(payload && payload.type))
  ipcMain.handle('tags:create', (_e, payload) => {
    const result = db.tags.createTag(payload)
    notifyDataChanged('tags', 'app')
    return result
  })
  ipcMain.handle('tags:delete', (_e, { id }) => {
    const result = db.tags.deleteTag(id)
    notifyDataChanged('tags', 'app')
    return result
  })

  // transactions
  ipcMain.handle('transactions:getAll', (_e, filters) => db.transactions.getTransactions(filters || {}))
  ipcMain.handle('transactions:create', (_e, payload) => {
    const result = db.transactions.createTransaction({ ...payload, source: 'app' })
    notifyDataChanged('transactions', 'app')
    return result
  })
  ipcMain.handle('transactions:update', (_e, { id, fields }) => {
    const result = db.transactions.updateTransaction(id, fields)
    notifyDataChanged('transactions', 'app')
    return result
  })
  ipcMain.handle('transactions:delete', (_e, { id }) => {
    const result = db.transactions.deleteTransaction(id)
    notifyDataChanged('transactions', 'app')
    return result
  })

  // investments
  ipcMain.handle('investments:getAll', () => db.investments.getInvestments())
  ipcMain.handle('investments:create', (_e, payload) => {
    const result = db.investments.createInvestment({ ...payload, source: 'app' })
    notifyDataChanged('investments', 'app')
    notifyDataChanged('transactions', 'app')
    return result
  })
  ipcMain.handle('investments:update', (_e, { id, fields }) => {
    const result = db.investments.updateInvestment(id, fields)
    notifyDataChanged('investments', 'app')
    notifyDataChanged('transactions', 'app')
    return result
  })
  ipcMain.handle('investments:delete', (_e, { id }) => {
    const result = db.investments.deleteInvestment(id)
    notifyDataChanged('investments', 'app')
    notifyDataChanged('transactions', 'app')
    return result
  })
  ipcMain.handle('investments:liquidate', (_e, { ids, amount, date, note }) => {
    const result = db.investments.liquidateInvestments(ids, { amount, date, note })
    notifyDataChanged('investments', 'app')
    notifyDataChanged('transactions', 'app')
    return result
  })
  ipcMain.handle('investments:getPortfolioComposition', () => db.investments.getPortfolioComposition())

  // recurring expenses
  ipcMain.handle('recurringExpenses:getAll', () => db.recurringExpenses.getRecurringExpenses())
  ipcMain.handle('recurringExpenses:create', (_e, payload) => {
    const result = db.recurringExpenses.createRecurringExpense(payload)
    notifyDataChanged('recurringExpenses', 'app')
    return result
  })
  ipcMain.handle('recurringExpenses:update', (_e, { id, fields }) => {
    const result = db.recurringExpenses.updateRecurringExpense(id, fields)
    notifyDataChanged('recurringExpenses', 'app')
    return result
  })
  ipcMain.handle('recurringExpenses:delete', (_e, { id }) => {
    const result = db.recurringExpenses.deleteRecurringExpense(id)
    notifyDataChanged('recurringExpenses', 'app')
    return result
  })

  // forecast
  ipcMain.handle('forecast:getData', () => db.forecast.getForecast())

  // asset tax rates
  ipcMain.handle('assetTaxRates:getAll', () => db.assetTaxRates.getAssetTaxRates())
  ipcMain.handle('assetTaxRates:upsert', (_e, payload) => {
    const result = db.assetTaxRates.upsertAssetTaxRate(payload)
    notifyDataChanged('assetTaxRates', 'app')
    return result
  })

  // salvadanaio
  ipcMain.handle('salvadanaio:get', () => db.salvadanaio.getSalvadanaio())

  // heatmap
  ipcMain.handle('heatmap:getData', (_e, { year }) => db.heatmap.getHeatmapData(year))

  // settings
  ipcMain.handle('settings:getAll', () => db.settings.getAllSettings())
  ipcMain.handle('settings:set', (_e, { key, value }) => {
    const result = db.settings.setSetting(key, value)
    notifyDataChanged('settings', 'app')
    return result
  })
  ipcMain.handle('settings:resetDatabase', () => {
    bot.stopBot()
    const result = db.settings.resetDatabase()
    notifyDataChanged('accounts', 'app')
    notifyDataChanged('transactions', 'app')
    notifyDataChanged('investments', 'app')
    notifyDataChanged('tags', 'app')
    notifyDataChanged('assetTaxRates', 'app')
    notifyDataChanged('settings', 'app')
    notifyDataChanged('recurringExpenses', 'app')
    return result
  })
  ipcMain.handle('settings:exportDatabase', async () => {
    const result = await dialog.showSaveDialog(win, {
      title: 'Esporta database',
      defaultPath: `gekko-runway-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'Database SQLite', extensions: ['db'] }]
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    try {
      return db.backup.exportDatabaseTo(result.filePath)
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('settings:importDatabase', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Importa database',
      properties: ['openFile'],
      filters: [{ name: 'Database SQLite', extensions: ['db'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true }
    try {
      bot.stopBot()
      const importResult = db.backup.importDatabaseFrom(result.filePaths[0])
      notifyDataChanged('accounts', 'app')
      notifyDataChanged('transactions', 'app')
      notifyDataChanged('investments', 'app')
      notifyDataChanged('tags', 'app')
      notifyDataChanged('assetTaxRates', 'app')
      notifyDataChanged('settings', 'app')
      notifyDataChanged('recurringExpenses', 'app')
      const savedToken = db.settings.getSetting('telegram_token')
      if (savedToken) bot.startBot(savedToken, win)
      return importResult
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  // bot
  ipcMain.handle('bot:start', (_e, { token }) => {
    try {
      db.settings.setSetting('telegram_token', token)
      bot.startBot(token, win)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
  ipcMain.handle('bot:stop', () => {
    bot.stopBot()
    return { success: true }
  })
  ipcMain.handle('bot:status', () => ({ running: bot.isRunning() }))
}

app.whenReady().then(() => {
  db = require('./db')
  bot = require('./bot')

  createWindow()
  registerIpcHandlers()

  const savedToken = db.settings.getSetting('telegram_token')
  if (savedToken) {
    bot.startBot(savedToken, win)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (bot) bot.stopBot()
  if (process.platform !== 'darwin') app.quit()
})
