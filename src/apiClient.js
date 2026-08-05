// Client HTTP verso l'API esposta da server.js, con la stessa forma a namespace
// (window.electronAPI, per compatibilità con le pagine esistenti). Percorsi relativi
// (senza "/" iniziale): risolvono rispetto all'URL del documento, quindi funzionano
// anche dietro un sottopercorso Caddy tipo /gekko-runway/.

function invokeRead(channel, payload) {
  const q = payload !== undefined ? `&payload=${encodeURIComponent(JSON.stringify(payload))}` : ''
  return fetch(`api/gekko-runway/data?channel=${channel}${q}`).then((r) => r.json())
}

function invokeWrite(channel, payload) {
  return fetch('api/gekko-runway/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, payload })
  }).then((r) => r.json())
}

async function exportDatabaseViaBrowser() {
  const res = await fetch('api/gekko-runway/export')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { success: false, error: err.error || 'Errore export' }
  }
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match ? match[1] : 'gekko-runway-backup.db'
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return { success: true, path: filename }
}

function importDatabaseViaBrowser() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.db'
    input.addEventListener('cancel', () => resolve({ success: false, canceled: true }))
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0]
      if (!file) {
        resolve({ success: false, canceled: true })
        return
      }
      try {
        const buffer = await file.arrayBuffer()
        const res = await fetch('api/gekko-runway/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: buffer
        })
        const result = await res.json()
        resolve(result)
      } catch (err) {
        resolve({ success: false, error: err.message })
      }
    })
    input.click()
  })
}

export function createApiClient() {
  return {
    accounts: {
      getAll: () => invokeRead('accounts:getAll'),
      create: (payload) => invokeWrite('accounts:create', payload),
      update: (payload) => invokeWrite('accounts:update', payload),
      delete: (payload) => invokeWrite('accounts:delete', payload),
      getBalanceHistory: (payload) => invokeRead('accounts:getBalanceHistory', payload)
    },
    tags: {
      getAll: (payload) => invokeRead('tags:getAll', payload),
      create: (payload) => invokeWrite('tags:create', payload),
      delete: (payload) => invokeWrite('tags:delete', payload)
    },
    transactions: {
      getAll: (payload) => invokeRead('transactions:getAll', payload),
      create: (payload) => invokeWrite('transactions:create', payload),
      update: (payload) => invokeWrite('transactions:update', payload),
      delete: (payload) => invokeWrite('transactions:delete', payload)
    },
    investments: {
      getAll: () => invokeRead('investments:getAll'),
      create: (payload) => invokeWrite('investments:create', payload),
      update: (payload) => invokeWrite('investments:update', payload),
      delete: (payload) => invokeWrite('investments:delete', payload),
      liquidate: (payload) => invokeWrite('investments:liquidate', payload),
      getPortfolioComposition: () => invokeRead('investments:getPortfolioComposition')
    },
    assetTaxRates: {
      getAll: () => invokeRead('assetTaxRates:getAll'),
      upsert: (payload) => invokeWrite('assetTaxRates:upsert', payload)
    },
    recurringExpenses: {
      getAll: () => invokeRead('recurringExpenses:getAll'),
      create: (payload) => invokeWrite('recurringExpenses:create', payload),
      update: (payload) => invokeWrite('recurringExpenses:update', payload),
      delete: (payload) => invokeWrite('recurringExpenses:delete', payload)
    },
    forecast: {
      getData: () => invokeRead('forecast:getData')
    },
    salvadanaio: {
      get: () => invokeRead('salvadanaio:get')
    },
    heatmap: {
      getData: (payload) => invokeRead('heatmap:getData', payload)
    },
    settings: {
      getAll: () => invokeRead('settings:getAll'),
      set: (payload) => invokeWrite('settings:set', payload),
      resetDatabase: () => invokeWrite('settings:resetDatabase'),
      exportDatabase: () => exportDatabaseViaBrowser(),
      importDatabase: () => importDatabaseViaBrowser()
    },
    onDataChanged: (callback) => {
      const es = new EventSource('api/gekko-runway/events')
      es.onmessage = (ev) => callback(JSON.parse(ev.data))
      return () => es.close()
    }
  }
}
