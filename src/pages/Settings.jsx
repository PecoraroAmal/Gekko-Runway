import React, { useEffect, useState } from 'react'
import { capitalize } from '../utils.js'

export default function Settings({ refreshToken, theme, onToggleTheme }) {
  const [tagsEntrata, setTagsEntrata] = useState([])
  const [tagsUscita, setTagsUscita] = useState([])
  const [newTagName, setNewTagName] = useState('')
  const [newTagType, setNewTagType] = useState('entrata')
  const [tagError, setTagError] = useState('')

  const [rates, setRates] = useState([])
  const [rateEdits, setRateEdits] = useState({})
  const [newRateType, setNewRateType] = useState('')
  const [newRateValue, setNewRateValue] = useState('')
  const [rateError, setRateError] = useState('')

  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetMessage, setResetMessage] = useState('')

  const [backupMessage, setBackupMessage] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)

  const [forecastStartDate, setForecastStartDate] = useState('')
  const [forecastEndDate, setForecastEndDate] = useState('')
  const [forecastMessage, setForecastMessage] = useState('')

  function loadAll() {
    window.electronAPI.tags.getAll({ type: 'entrata' }).then(setTagsEntrata)
    window.electronAPI.tags.getAll({ type: 'uscita' }).then(setTagsUscita)
    window.electronAPI.assetTaxRates.getAll().then((r) => {
      setRates(r)
      const edits = {}
      r.forEach((row) => (edits[row.type] = row.rate))
      setRateEdits(edits)
    })
    window.electronAPI.settings.getAll().then((s) => {
      setForecastStartDate(s.forecast_start_date || '')
      setForecastEndDate(s.forecast_end_date || '')
    })
  }

  useEffect(loadAll, [refreshToken])

  async function addTag() {
    setTagError('')
    const name = newTagName.trim()
    if (!name) {
      setTagError('Il nome del tag non può essere vuoto')
      return
    }
    await window.electronAPI.tags.create({ name, type: newTagType })
    setNewTagName('')
    loadAll()
  }

  async function removeTag(id) {
    await window.electronAPI.tags.delete({ id })
    loadAll()
  }

  async function saveRate(type) {
    setRateError('')
    const rate = Number(rateEdits[type])
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setRateError('Aliquota non valida (0-100)')
      return
    }
    await window.electronAPI.assetTaxRates.upsert({ type, rate })
    loadAll()
  }

  async function addRateType() {
    setRateError('')
    const type = newRateType.trim().toLowerCase()
    const rate = Number(newRateValue)
    if (!type) {
      setRateError('Il nome della tipologia non può essere vuoto')
      return
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setRateError('Aliquota non valida (0-100)')
      return
    }
    await window.electronAPI.assetTaxRates.upsert({ type, rate })
    setNewRateType('')
    setNewRateValue('')
    loadAll()
  }

  async function saveForecastDates() {
    setForecastMessage('')
    if (forecastStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(forecastStartDate)) {
      setForecastMessage('Data di inizio non valida')
      return
    }
    if (!forecastEndDate || !/^\d{4}-\d{2}-\d{2}$/.test(forecastEndDate)) {
      setForecastMessage('Data di fine non valida')
      return
    }
    if (forecastStartDate && forecastStartDate > forecastEndDate) {
      setForecastMessage('La data di inizio deve essere precedente alla data di fine')
      return
    }
    await window.electronAPI.settings.set({ key: 'forecast_start_date', value: forecastStartDate })
    await window.electronAPI.settings.set({ key: 'forecast_end_date', value: forecastEndDate })
    setForecastMessage('Date di proiezione salvate.')
  }

  async function exportDatabase() {
    setBackupMessage('')
    setBackupBusy(true)
    try {
      const result = await window.electronAPI.settings.exportDatabase()
      if (result.canceled) {
        setBackupMessage('')
      } else if (result.success) {
        setBackupMessage(`Database esportato in: ${result.path}`)
      } else {
        setBackupMessage(`Errore: ${result.error}`)
      }
    } finally {
      setBackupBusy(false)
    }
  }

  async function importDatabase() {
    if (!window.confirm('Importando un database TUTTI i dati attuali (conti, movimenti, investimenti, tag, aliquote) verranno sostituiti con quelli del file selezionato. Continuare?')) {
      return
    }
    setBackupMessage('')
    setBackupBusy(true)
    try {
      const result = await window.electronAPI.settings.importDatabase()
      if (result.canceled) {
        setBackupMessage('')
      } else if (result.success) {
        setBackupMessage('Database importato con successo.')
        loadAll()
      } else {
        setBackupMessage(`Errore: ${result.error}`)
      }
    } finally {
      setBackupBusy(false)
    }
  }

  async function resetDatabase() {
    if (resetConfirmText !== 'RESET') return
    if (!window.confirm('Questa azione è irreversibile: TUTTI i dati (conti, movimenti, investimenti, tag, aliquote) verranno eliminati definitivamente. Continuare?')) {
      return
    }
    await window.electronAPI.settings.resetDatabase()
    setResetConfirmText('')
    setResetMessage('Database resettato.')
    loadAll()
  }

  return (
    <div>
      <h1 className="page-title">Impostazioni</h1>

      <div className="card">
        <h2 className="card-title">Aspetto</h2>
        <div className="btn-row">
          <button className="btn" onClick={onToggleTheme}>
            <i className={theme === 'light' ? 'fa-regular fa-moon' : 'fa-regular fa-sun'}></i>
            {theme === 'light' ? 'Passa a modalità scura' : 'Passa a modalità chiara'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Tag entrate</h2>
        <div className="tag-pill-list">
          {tagsEntrata.length === 0 && <div className="empty-state">Nessun tag</div>}
          {tagsEntrata.map((t) => (
            <span key={t.id} className="tag-pill">
              {t.name}
              <button onClick={() => removeTag(t.id)}><i className="fa-regular fa-trash-can"></i></button>
            </span>
          ))}
        </div>

        <h2 className="card-title" style={{ marginTop: 20 }}>Tag uscite</h2>
        <div className="tag-pill-list">
          {tagsUscita.length === 0 && <div className="empty-state">Nessun tag</div>}
          {tagsUscita.map((t) => (
            <span key={t.id} className="tag-pill">
              {t.name}
              <button onClick={() => removeTag(t.id)}><i className="fa-regular fa-trash-can"></i></button>
            </span>
          ))}
        </div>

        <hr className="section-divider" />

        <div className="form-grid">
          <div className="field">
            <label>Nome tag</label>
            <input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} />
          </div>
          <div className="field">
            <label>Tipo</label>
            <select value={newTagType} onChange={(e) => setNewTagType(e.target.value)}>
              <option value="entrata">Entrata</option>
              <option value="uscita">Uscita</option>
            </select>
          </div>
        </div>
        {tagError && <div className="field-error">{tagError}</div>}
        <div className="btn-row">
          <button className="btn btn-primary" onClick={addTag}><i className="fa-solid fa-plus"></i>Aggiungi tag</button>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Aliquote fiscali investimenti</h2>
        <table>
          <thead>
            <tr>
              <th>Tipologia</th>
              <th>Aliquota %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.type}>
                <td>{capitalize(r.type)}</td>
                <td style={{ maxWidth: 120 }}>
                  <input
                    type="number"
                    step="0.1"
                    value={rateEdits[r.type] ?? r.rate}
                    onChange={(e) => setRateEdits({ ...rateEdits, [r.type]: e.target.value })}
                  />
                </td>
                <td>
                  <button className="icon-btn" title="Salva" onClick={() => saveRate(r.type)}>
                    <i className="fa-regular fa-floppy-disk"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <hr className="section-divider" />

        <div className="form-grid">
          <div className="field">
            <label>Nuova tipologia</label>
            <input value={newRateType} onChange={(e) => setNewRateType(e.target.value)} />
          </div>
          <div className="field">
            <label>Aliquota %</label>
            <input type="number" step="0.1" value={newRateValue} onChange={(e) => setNewRateValue(e.target.value)} />
          </div>
        </div>
        {rateError && <div className="field-error">{rateError}</div>}
        <div className="btn-row">
          <button className="btn btn-primary" onClick={addRateType}><i className="fa-solid fa-plus"></i>Aggiungi tipologia</button>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Previsioni</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 0 }}>
          La data di inizio limita quali uscite storiche vengono usate per calcolare la media mensile
          della proiezione: se ad esempio imposti la data di oggi, le spese precedenti non verranno
          più considerate. Lasciala vuota per usare tutto lo storico disponibile.
        </p>
        <div className="form-grid" style={{ maxWidth: 500 }}>
          <div className="field">
            <label>Data inizio proiezioni (opzionale)</label>
            <input type="date" value={forecastStartDate} onChange={(e) => setForecastStartDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Data fine proiezioni</label>
            <input type="date" value={forecastEndDate} onChange={(e) => setForecastEndDate(e.target.value)} />
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={saveForecastDates}>
            <i className="fa-regular fa-floppy-disk"></i>Salva
          </button>
        </div>
        {forecastMessage && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--fg-muted)' }}>{forecastMessage}</div>}
      </div>

      <div className="card">
        <h2 className="card-title">Backup database</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 0 }}>
          Esporta il file del database (conti, movimenti, investimenti, tag, aliquote e configurazione)
          per conservarlo come backup, oppure importane uno per ripristinare i dati: l'importazione
          sostituisce completamente il database attuale.
        </p>
        <div className="btn-row">
          <button className="btn" disabled={backupBusy} onClick={exportDatabase}>
            <i className="fa-solid fa-download"></i>Esporta database
          </button>
          <button className="btn" disabled={backupBusy} onClick={importDatabase}>
            <i className="fa-solid fa-upload"></i>Importa database
          </button>
        </div>
        {backupMessage && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--fg-muted)' }}>{backupMessage}</div>}
      </div>

      <div className="card" style={{ borderColor: 'var(--pastel-red)' }}>
        <h2 className="card-title" style={{ color: 'var(--pastel-red-dark)' }}>Zona pericolosa</h2>
        <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 0 }}>
          Elimina definitivamente tutti i dati: conti, movimenti, investimenti, tag e aliquote fiscali.
          L'operazione non può essere annullata.
        </p>
        <div className="form-grid" style={{ maxWidth: 320 }}>
          <div className="field">
            <label>Scrivi "RESET" per confermare</label>
            <input value={resetConfirmText} onChange={(e) => setResetConfirmText(e.target.value)} placeholder="RESET" />
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn-danger" disabled={resetConfirmText !== 'RESET'} onClick={resetDatabase}>
            <i className="fa-solid fa-triangle-exclamation"></i>Resetta database
          </button>
        </div>
        {resetMessage && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--fg-muted)' }}>{resetMessage}</div>}
      </div>
    </div>
  )
}
