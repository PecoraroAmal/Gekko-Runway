import React, { useEffect, useMemo, useState } from 'react'
import { todayStr } from '../utils.js'

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

function formFromTransaction(tx) {
  return {
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
  }
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

export default function TransactionFormModal({ open, transaction, onClose, onSaved }) {
  const [accounts, setAccounts] = useState([])
  const [allTags, setAllTags] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})

  const editingId = transaction ? transaction.id : null

  useEffect(() => {
    if (!open) return
    window.electronAPI.accounts.getAll().then(setAccounts)
    window.electronAPI.tags.getAll({}).then(setAllTags)
    setForm(transaction ? formFromTransaction(transaction) : emptyForm)
    setErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction])

  const tagsForFormType = useMemo(() => allTags.filter((t) => t.type === form.type), [allTags, form.type])
  const selectedFormAccount = accounts.find((a) => a.id === Number(form.account_id))
  const accountsForForm = useMemo(
    () => accounts.filter((a) => a.active || a.id === Number(form.account_id)),
    [accounts, form.account_id]
  )

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
    onSaved && onSaved()
    onClose()
  }

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{editingId ? 'Modifica movimento' : 'Nuovo movimento'}</div>
          <button className="modal-close-btn" onClick={onClose}>
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
          </div>

          <details className="collapsible advanced-fields">
            <summary className="collapsible-summary">Altri dettagli</summary>

            <div className="field" style={{ marginTop: 12 }}>
              <label>Nota</label>
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>

            {form.type === 'uscita' && (selectedFormAccount?.roundup_enabled || selectedFormAccount?.saveback_enabled) && (
              <div className="form-grid">
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
          </details>

          <div className="btn-row" style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary"><i className="fa-solid fa-plus"></i>{editingId ? 'Salva modifiche' : 'Aggiungi movimento'}</button>
            <button type="button" className="btn" onClick={onClose}>Annulla</button>
          </div>
        </form>
      </div>
    </div>
  )
}
