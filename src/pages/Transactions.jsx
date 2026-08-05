import React, { useEffect, useMemo, useState } from 'react'
import { formatMoney, formatDate } from '../utils.js'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const emptyForm = {
  type: 'uscita',
  date: todayStr(),
  amount: '',
  account_id: '',
  to_account_id: '',
  tag: '',
  note: '',
  roundup: '0',
  saveback: '0',
  include_in_forecast: true
}

function validateTransactionForm(values, account) {
  const errors = {}
  const amount = Number(values.amount)
  if (!values.amount || Number.isNaN(amount) || amount <= 0) errors.amount = 'Importo non valido'
  if (!values.account_id) errors.account_id = 'Seleziona un conto'
  if (values.type !== 'trasferimento' && !values.tag) errors.tag = 'Seleziona un tag'
  if (!values.date || !/^\d{4}-\d{2}-\d{2}$/.test(values.date)) errors.date = 'Data non valida'
  if (values.type === 'uscita' && account?.roundup_enabled) {
    const roundup = Number(values.roundup || 0)
    if (Number.isNaN(roundup) || roundup < 0) errors.roundup = 'Roundup non valido'
  }
  if (values.type === 'uscita' && account?.saveback_enabled) {
    const saveback = Number(values.saveback || 0)
    if (Number.isNaN(saveback) || saveback < 0) errors.saveback = 'Saveback non valido'
  }
  if (values.type === 'trasferimento') {
    if (!values.to_account_id) errors.to_account_id = 'Seleziona un conto di destinazione'
    else if (Number(values.to_account_id) === Number(values.account_id)) {
      errors.to_account_id = 'Il conto di destinazione deve essere diverso da quello di origine'
    }
  }
  return errors
}

export default function Transactions({ refreshToken }) {
  const [accounts, setAccounts] = useState([])
  const [allTags, setAllTags] = useState([])
  const [transactions, setTransactions] = useState([])

  const [filters, setFilters] = useState({ type: '', accountId: '', tag: '', dateFrom: '', dateTo: '' })

  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [errors, setErrors] = useState({})
  const [showForm, setShowForm] = useState(false)

  function loadStatic() {
    window.electronAPI.accounts.getAll().then(setAccounts)
    window.electronAPI.tags.getAll({}).then(setAllTags)
  }

  function loadTransactions() {
    const apiFilters = {}
    if (filters.type) apiFilters.type = filters.type
    if (filters.accountId) apiFilters.accountId = Number(filters.accountId)
    if (filters.tag) apiFilters.tag = filters.tag
    if (filters.dateFrom) apiFilters.dateFrom = filters.dateFrom
    if (filters.dateTo) apiFilters.dateTo = filters.dateTo
    window.electronAPI.transactions.getAll(apiFilters).then(setTransactions)
  }

  useEffect(loadStatic, [refreshToken])
  useEffect(loadTransactions, [refreshToken, filters])

  const tagsForFilterType = useMemo(
    () => (filters.type ? allTags.filter((t) => t.type === filters.type) : allTags),
    [allTags, filters.type]
  )
  const tagsForFormType = useMemo(() => allTags.filter((t) => t.type === form.type), [allTags, form.type])
  const selectedFormAccount = accounts.find((a) => a.id === Number(form.account_id))
  const accountsForForm = useMemo(
    () => accounts.filter((a) => a.active || a.id === Number(form.account_id)),
    [accounts, form.account_id]
  )

  function startEdit(tx) {
    setEditingId(tx.id)
    setForm({
      type: tx.type,
      date: tx.date,
      amount: String(tx.amount),
      account_id: String(tx.account_id),
      to_account_id: tx.to_account_id == null ? '' : String(tx.to_account_id),
      tag: tx.tag || '',
      note: tx.note || '',
      roundup: String(tx.roundup || 0),
      saveback: String(tx.saveback || 0),
      include_in_forecast: tx.include_in_forecast == null ? true : !!tx.include_in_forecast
    })
    setErrors({})
    setShowForm(true)
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyForm)
    setErrors({})
  }

  function openCreateForm() {
    cancelEdit()
    setShowForm(true)
  }

  function closeForm() {
    cancelEdit()
    setShowForm(false)
  }

  function applyCalculatedSaveback() {
    if (!selectedFormAccount || !selectedFormAccount.saveback_enabled) return
    const amount = Number(form.amount)
    if (!Number.isFinite(amount)) return
    const calc = Math.round(amount * (selectedFormAccount.saveback_percent / 100) * 100) / 100
    setForm({ ...form, saveback: String(calc) })
  }

  async function submitForm(e) {
    e.preventDefault()
    const validationErrors = validateTransactionForm(form, selectedFormAccount)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    const payload = {
      type: form.type,
      date: form.date,
      amount: Number(form.amount),
      account_id: Number(form.account_id),
      to_account_id: form.type === 'trasferimento' ? Number(form.to_account_id) : null,
      tag: form.type === 'trasferimento' ? null : form.tag,
      note: form.note.trim() || null,
      roundup: form.type === 'uscita' && selectedFormAccount?.roundup_enabled ? Number(form.roundup || 0) : 0,
      saveback: form.type === 'uscita' && selectedFormAccount?.saveback_enabled ? Number(form.saveback || 0) : 0,
      include_in_forecast: form.type === 'uscita' ? !!form.include_in_forecast : true
    }

    if (editingId) {
      await window.electronAPI.transactions.update({ id: editingId, fields: payload })
    } else {
      await window.electronAPI.transactions.create(payload)
    }
    closeForm()
    loadTransactions()
  }

  async function deleteTransaction(id) {
    if (!window.confirm('Eliminare questa transazione?')) return
    await window.electronAPI.transactions.delete({ id })
    loadTransactions()
  }

  function accountName(id) {
    const a = accounts.find((acc) => acc.id === id)
    return a ? a.name : '—'
  }

  return (
    <div>
      <h1 className="page-title">Movimenti</h1>

      <div className="btn-row" style={{ marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={openCreateForm}><i className="fa-solid fa-plus"></i>Aggiungi movimento</button>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editingId ? 'Modifica movimento' : 'Nuovo movimento'}</div>
              <button className="modal-close-btn" onClick={closeForm}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
        <form onSubmit={submitForm}>
          <div className="form-grid">
            <div className="field">
              <label>Tipo</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value, tag: '' })}
              >
                <option value="entrata">Entrata</option>
                <option value="uscita">Uscita</option>
                <option value="trasferimento">Trasferimento</option>
              </select>
            </div>
            <div className="field">
              <label>Data</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              {errors.date && <div className="field-error">{errors.date}</div>}
            </div>
            <div className="field">
              <label>Importo (€)</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              {errors.amount && <div className="field-error">{errors.amount}</div>}
            </div>
            <div className="field">
              <label>{form.type === 'trasferimento' ? 'Conto origine' : 'Conto'}</label>
              <select
                value={form.account_id}
                onChange={(e) => {
                  const acc = accounts.find((a) => a.id === Number(e.target.value))
                  setForm({
                    ...form,
                    account_id: e.target.value,
                    roundup: acc?.roundup_enabled ? form.roundup : '0',
                    saveback: acc?.saveback_enabled ? form.saveback : '0'
                  })
                }}
              >
                <option value="">Seleziona…</option>
                {accountsForForm.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{!a.active ? ' (chiuso)' : ''}</option>
                ))}
              </select>
              {errors.account_id && <div className="field-error">{errors.account_id}</div>}
            </div>
            {form.type === 'trasferimento' ? (
              <div className="field">
                <label>Conto destinazione</label>
                <select value={form.to_account_id} onChange={(e) => setForm({ ...form, to_account_id: e.target.value })}>
                  <option value="">Seleziona…</option>
                  {accounts
                    .filter((a) => a.active && a.id !== Number(form.account_id))
                    .map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
                {errors.to_account_id && <div className="field-error">{errors.to_account_id}</div>}
              </div>
            ) : (
              <div className="field">
                <label>Tag</label>
                <select value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })}>
                  <option value="">Seleziona…</option>
                  {tagsForFormType.map((t) => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
                {errors.tag && <div className="field-error">{errors.tag}</div>}
              </div>
            )}
            <div className="field">
              <label>Nota</label>
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>

          {form.type === 'uscita' && (selectedFormAccount?.roundup_enabled || selectedFormAccount?.saveback_enabled) && (
            <div className="form-grid" style={{ marginTop: 4 }}>
              {selectedFormAccount?.roundup_enabled && (
                <div className="field">
                  <label>Roundup (€)</label>
                  <input type="number" step="0.01" value={form.roundup} onChange={(e) => setForm({ ...form, roundup: e.target.value })} />
                  {errors.roundup && <div className="field-error">{errors.roundup}</div>}
                </div>
              )}
              {selectedFormAccount?.saveback_enabled && (
                <div className="field">
                  <label>Saveback (€)</label>
                  <input type="number" step="0.01" value={form.saveback} onChange={(e) => setForm({ ...form, saveback: e.target.value })} />
                  {errors.saveback && <div className="field-error">{errors.saveback}</div>}
                  <button type="button" className="btn" style={{ marginTop: 4, width: 'fit-content' }} onClick={applyCalculatedSaveback}>
                    <i className="fa-solid fa-calculator"></i>Usa calcolato ({selectedFormAccount.saveback_percent}%)
                  </button>
                </div>
              )}
            </div>
          )}

          {form.type === 'uscita' && (
            <div className="checkbox-field" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                id="include_in_forecast"
                checked={form.include_in_forecast}
                onChange={(e) => setForm({ ...form, include_in_forecast: e.target.checked })}
              />
              <label htmlFor="include_in_forecast">Considera nelle Previsioni</label>
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary"><i className="fa-solid fa-plus"></i>{editingId ? 'Salva modifiche' : 'Aggiungi movimento'}</button>
            <button type="button" className="btn" onClick={closeForm}>Annulla</button>
          </div>
        </form>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="card-title">Filtri</h2>
        <div className="filters-bar">
          <div className="field">
            <label>Tipo</label>
            <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value, tag: '' })}>
              <option value="">Tutti</option>
              <option value="entrata">Entrata</option>
              <option value="uscita">Uscita</option>
              <option value="trasferimento">Trasferimento</option>
            </select>
          </div>
          <div className="field">
            <label>Conto</label>
            <select value={filters.accountId} onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}>
              <option value="">Tutti</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{!a.active ? ' (chiuso)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Tag</label>
            <select value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })}>
              <option value="">Tutti</option>
              {tagsForFilterType.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Dal</label>
            <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
          </div>
          <div className="field">
            <label>Al</label>
            <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
          </div>
          <button className="btn" onClick={() => setFilters({ type: '', accountId: '', tag: '', dateFrom: '', dateTo: '' })}>
            <i className="fa-solid fa-rotate-left"></i>Reset
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Elenco movimenti</h2>
        {transactions.length === 0 ? (
          <div className="empty-state">Nessun movimento trovato</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Importo</th>
                <th>Conto</th>
                <th>Tag</th>
                <th>Nota</th>
                <th>Roundup</th>
                <th>Saveback</th>
                <th>Previsioni</th>
                <th>Origine</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{formatDate(tx.date)}</td>
                  <td>{tx.type === 'entrata' ? 'Entrata' : tx.type === 'uscita' ? 'Uscita' : 'Trasferimento'}</td>
                  <td>{formatMoney(tx.amount)}</td>
                  <td>
                    {tx.type === 'trasferimento'
                      ? `${accountName(tx.account_id)} → ${accountName(tx.to_account_id)}`
                      : accountName(tx.account_id)}
                  </td>
                  <td>{tx.tag || '—'}</td>
                  <td>{tx.note || '—'}</td>
                  <td>{tx.roundup ? formatMoney(tx.roundup) : '—'}</td>
                  <td>{tx.saveback ? formatMoney(tx.saveback) : '—'}</td>
                  <td>{tx.type === 'uscita' ? (tx.include_in_forecast ? 'Sì' : 'No') : '—'}</td>
                  <td><span className={`badge badge-${tx.source}`}>{tx.source}</span></td>
                  <td>
                    <div className="btn-row">
                      <button className="icon-btn" title="Modifica" onClick={() => startEdit(tx)}>
                        <i className="fa-regular fa-pen-to-square"></i>
                      </button>
                      <button className="icon-btn danger" title="Elimina" onClick={() => deleteTransaction(tx.id)}>
                        <i className="fa-regular fa-trash-can"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
