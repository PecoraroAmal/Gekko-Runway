import React, { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatMoney } from '../utils.js'

const emptyForm = {
  name: '',
  initial_balance: '0',
  saveback_enabled: false,
  saveback_percent: '0',
  roundup_enabled: false,
  color: '#A8D5BA'
}

function validateAccountForm(values) {
  const errors = {}
  if (!values.name.trim()) errors.name = 'Il nome è obbligatorio'
  if (values.initial_balance === '' || Number.isNaN(Number(values.initial_balance))) {
    errors.initial_balance = 'Saldo iniziale non valido'
  }
  if (values.saveback_enabled) {
    const pct = Number(values.saveback_percent)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) errors.saveback_percent = 'Percentuale non valida (0-100)'
  }
  return errors
}

export default function Accounts({ refreshToken }) {
  const [accounts, setAccounts] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [errors, setErrors] = useState({})
  const [selectedAccountId, setSelectedAccountId] = useState(null)
  const [balanceHistory, setBalanceHistory] = useState([])

  function loadAccounts() {
    window.electronAPI.accounts.getAll().then((rows) => {
      setAccounts(rows)
      if (!selectedAccountId && rows.length > 0) setSelectedAccountId(rows[0].id)
    })
  }

  useEffect(loadAccounts, [refreshToken])

  useEffect(() => {
    if (selectedAccountId == null) {
      setBalanceHistory([])
      return
    }
    window.electronAPI.accounts.getBalanceHistory({ accountId: selectedAccountId }).then(setBalanceHistory)
  }, [selectedAccountId, refreshToken])

  function startEdit(account) {
    setEditingId(account.id)
    setForm({
      name: account.name,
      initial_balance: String(account.initial_balance),
      saveback_enabled: !!account.saveback_enabled,
      saveback_percent: String(account.saveback_percent),
      roundup_enabled: !!account.roundup_enabled,
      color: account.color
    })
    setErrors({})
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyForm)
    setErrors({})
  }

  async function submitForm(e) {
    e.preventDefault()
    const validationErrors = validateAccountForm(form)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    const payload = {
      name: form.name.trim(),
      initial_balance: Number(form.initial_balance),
      saveback_enabled: form.saveback_enabled,
      saveback_percent: Number(form.saveback_percent),
      roundup_enabled: form.roundup_enabled,
      color: form.color
    }

    if (editingId) {
      await window.electronAPI.accounts.update({ id: editingId, fields: payload })
    } else {
      await window.electronAPI.accounts.create(payload)
    }
    cancelEdit()
    loadAccounts()
  }

  async function deleteAccount(id) {
    if (!window.confirm('Eliminare il conto e tutte le transazioni collegate?')) return
    await window.electronAPI.accounts.delete({ id })
    if (selectedAccountId === id) setSelectedAccountId(null)
    loadAccounts()
  }

  async function toggleActive(account) {
    if (account.active && !window.confirm('Chiudere questo conto? Non sarà più selezionabile per nuovi movimenti, ma la cronologia e le statistiche resteranno visibili.')) return
    await window.electronAPI.accounts.update({ id: account.id, fields: { active: !account.active } })
    loadAccounts()
  }

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)

  return (
    <div>
      <h1 className="page-title">Conti</h1>

      <div className="card">
        <h2 className="card-title">{editingId ? 'Modifica conto' : 'Nuovo conto'}</h2>
        <form onSubmit={submitForm}>
          <div className="form-grid">
            <div className="field">
              <label>Nome</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {errors.name && <div className="field-error">{errors.name}</div>}
            </div>
            <div className="field">
              <label>Saldo iniziale (€)</label>
              <input
                type="number"
                step="0.01"
                value={form.initial_balance}
                onChange={(e) => setForm({ ...form, initial_balance: e.target.value })}
              />
              {errors.initial_balance && <div className="field-error">{errors.initial_balance}</div>}
            </div>
            <div className="field">
              <label>Colore</label>
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </div>
          </div>

          <div className="checkbox-field">
            <input
              type="checkbox"
              id="saveback_enabled"
              checked={form.saveback_enabled}
              onChange={(e) => setForm({ ...form, saveback_enabled: e.target.checked })}
            />
            <label htmlFor="saveback_enabled">Saveback attivo</label>
          </div>
          {form.saveback_enabled && (
            <div className="field" style={{ maxWidth: 200 }}>
              <label>Percentuale saveback (%)</label>
              <input
                type="number"
                step="0.1"
                value={form.saveback_percent}
                onChange={(e) => setForm({ ...form, saveback_percent: e.target.value })}
              />
              {errors.saveback_percent && <div className="field-error">{errors.saveback_percent}</div>}
            </div>
          )}

          <div className="checkbox-field">
            <input
              type="checkbox"
              id="roundup_enabled"
              checked={form.roundup_enabled}
              onChange={(e) => setForm({ ...form, roundup_enabled: e.target.checked })}
            />
            <label htmlFor="roundup_enabled">Roundup attivo</label>
          </div>

          <div className="btn-row">
            <button type="submit" className="btn btn-primary"><i className="fa-solid fa-plus"></i>{editingId ? 'Salva modifiche' : 'Crea conto'}</button>
            {editingId && <button type="button" className="btn" onClick={cancelEdit}>Annulla</button>}
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="card-title">Elenco conti</h2>
        {accounts.length === 0 ? (
          <div className="empty-state">Nessun conto creato</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Nome</th>
                <th>Saldo iniziale</th>
                <th>Saldo corrente</th>
                <th>Saveback</th>
                <th>Roundup</th>
                <th>Stato</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr
                  key={a.id}
                  style={{
                    cursor: 'pointer',
                    background: a.id === selectedAccountId ? 'var(--accent-soft)' : 'transparent',
                    opacity: a.active ? 1 : 0.6
                  }}
                  onClick={() => setSelectedAccountId(a.id)}
                >
                  <td><span className="color-dot" style={{ background: a.color }} /></td>
                  <td>{a.name}</td>
                  <td>{formatMoney(a.initial_balance)}</td>
                  <td>{formatMoney(a.balance)}</td>
                  <td>{a.saveback_enabled ? `${a.saveback_percent}%` : '—'}</td>
                  <td>{a.roundup_enabled ? 'Attivo' : '—'}</td>
                  <td>{a.active ? 'Attivo' : 'Chiuso'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="btn-row">
                      <button className="icon-btn" title="Modifica" onClick={() => startEdit(a)}>
                        <i className="fa-regular fa-pen-to-square"></i>
                      </button>
                      <button className="icon-btn" title={a.active ? 'Chiudi conto' : 'Riapri conto'} onClick={() => toggleActive(a)}>
                        <i className={a.active ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open'}></i>
                      </button>
                      <button className="icon-btn danger" title="Elimina" onClick={() => deleteAccount(a.id)}>
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

      {selectedAccount && (
        <div className="card">
          <h2 className="card-title">Andamento saldo — {selectedAccount.name}</h2>
          {balanceHistory.length === 0 ? (
            <div className="empty-state">Nessuna transazione registrata per questo conto</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={balanceHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toLocaleString('it-IT')}€`} />
                <Tooltip formatter={(v) => formatMoney(Number(v))} />
                <Line type="monotone" dataKey="balance" stroke={selectedAccount.color} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  )
}
