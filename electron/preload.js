const { contextBridge, ipcRenderer } = require('electron')

const invoke = (channel) => (payload) => ipcRenderer.invoke(channel, payload)

contextBridge.exposeInMainWorld('electronAPI', {
  accounts: {
    getAll: invoke('accounts:getAll'),
    create: invoke('accounts:create'),
    update: invoke('accounts:update'),
    delete: invoke('accounts:delete'),
    getBalanceHistory: invoke('accounts:getBalanceHistory')
  },
  tags: {
    getAll: invoke('tags:getAll'),
    create: invoke('tags:create'),
    delete: invoke('tags:delete')
  },
  transactions: {
    getAll: invoke('transactions:getAll'),
    create: invoke('transactions:create'),
    update: invoke('transactions:update'),
    delete: invoke('transactions:delete')
  },
  investments: {
    getAll: invoke('investments:getAll'),
    create: invoke('investments:create'),
    update: invoke('investments:update'),
    delete: invoke('investments:delete'),
    liquidate: invoke('investments:liquidate'),
    getPortfolioComposition: invoke('investments:getPortfolioComposition')
  },
  assetTaxRates: {
    getAll: invoke('assetTaxRates:getAll'),
    upsert: invoke('assetTaxRates:upsert')
  },
  recurringExpenses: {
    getAll: invoke('recurringExpenses:getAll'),
    create: invoke('recurringExpenses:create'),
    update: invoke('recurringExpenses:update'),
    delete: invoke('recurringExpenses:delete')
  },
  forecast: {
    getData: invoke('forecast:getData')
  },
  salvadanaio: {
    get: invoke('salvadanaio:get')
  },
  heatmap: {
    getData: invoke('heatmap:getData')
  },
  settings: {
    getAll: invoke('settings:getAll'),
    set: invoke('settings:set'),
    resetDatabase: invoke('settings:resetDatabase'),
    exportDatabase: invoke('settings:exportDatabase'),
    importDatabase: invoke('settings:importDatabase')
  },
  bot: {
    start: invoke('bot:start'),
    stop: invoke('bot:stop'),
    status: invoke('bot:status')
  },
  onDataChanged: (callback) => {
    const listener = (_e, payload) => callback(payload)
    ipcRenderer.on('data-changed', listener)
    return () => ipcRenderer.removeListener('data-changed', listener)
  }
})
