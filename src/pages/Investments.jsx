import React, { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatMoney, formatPercent, capitalize } from '../utils.js'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const emptyForm = {
  asset_name: '',
  tag: '',
  account_id: '',
  buy_price: '',
  amount_invested: '',
  target_price: '',
  date: todayStr()
}

const emptyLiquidateForm = { amount: '', date: todayStr(), note: '' }

function validateInvestmentForm(values) {
  const errors = {}
  if (!values.asset_name.trim()) errors.asset_name = 'Nome asset obbligatorio'
  if (!values.tag) errors.tag = 'Seleziona una tipologia'
  if (!values.account_id) errors.account_id = 'Seleziona un conto'
  const buyPrice = Number(values.buy_price)
  if (!values.buy_price || Number.isNaN(buyPrice) || buyPrice <= 0) errors.buy_price = 'Prezzo non valido'
  const amountInvested = Number(values.amount_invested)
  if (!values.amount_invested || Number.isNaN(amountInvested) || amountInvested <= 0) errors.amount_invested = 'Importo non valido'
  if (values.target_price !== '') {
    const target = Number(values.target_price)
    if (Number.isNaN(target) || target <= 0) errors.target_price = 'Prezzo target non valido'
  }
  if (!values.date || !/^\d{4}-\d{2}-\d{2}$/.test(values.date)) errors.date = 'Data non valida'
  return errors
}

const PIE_COLORS = ['#a8d5ba', '#f4a3a3', '#f5dfa0', '#cfe3f7', '#d9c2f0', '#f0c9a0']

export default function Investments({ refreshToken }) {
  const [investments, setInvestments] = useState([])
  const [taxRates, setTaxRates] = useState([])
  const [composition, setComposition] = useState([])
  const [accounts, setAccounts] = useState([])

  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [errors, setErrors] = useState({})
  const [showForm, setShowForm] = useState(false)

  const [selectedIds, setSelectedIds] = useState([])
  const [liquidateForm, setLiquidateForm] = useState(emptyLiquidateForm)
  const [liquidateError, setLiquidateError] = useState('')

  function loadAll() {
    window.electronAPI.investments.getAll().then(setInvestments)
    window.electronAPI.assetTaxRates.getAll().then(setTaxRates)
    window.electronAPI.investments.getPortfolioComposition().then(setComposition)
    window.electronAPI.accounts.getAll().then(setAccounts)
  }

  useEffect(loadAll, [refreshToken])

  const capitaleInvestito = composition.reduce((sum, c) => sum + c.total, 0)
  const differenza = investments.reduce((sum, inv) => sum + (inv.plusvalenza_netta ?? 0), 0)
  const capitaleFine = capitaleInvestito + differenza
  const rendimentoNettoPct = capitaleInvestito !== 0 ? (differenza / capitaleInvestito) * 100 : null

  function accountName(id) {
    const a = accounts.find((acc) => acc.id === id)
    return a ? a.name : '—'
  }

  const knownAssetNames = useMemo(
    () => [...new Set(investments.map((inv) => inv.asset_name))].sort((a, b) => a.localeCompare(b, 'it')),
    [investments]
  )

  function startEdit(inv) {
    setEditingId(inv.id)
    setForm({
      asset_name: inv.asset_name,
      tag: inv.tag,
      account_id: inv.account_id == null ? '' : String(inv.account_id),
      buy_price: String(inv.buy_price),
      amount_invested: String(inv.amount_invested),
      target_price: inv.target_price == null ? '' : String(inv.target_price),
      date: inv.date
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

  async function submitForm(e) {
    e.preventDefault()
    const validationErrors = validateInvestmentForm(form)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    const payload = {
      asset_name: form.asset_name.trim(),
      tag: form.tag,
      account_id: Number(form.account_id),
      buy_price: Number(form.buy_price),
      amount_invested: Number(form.amount_invested),
      target_price: form.target_price === '' ? null : Number(form.target_price),
      date: form.date
    }

    if (editingId) {
      await window.electronAPI.investments.update({ id: editingId, fields: payload })
    } else {
      await window.electronAPI.investments.create(payload)
    }
    closeForm()
    loadAll()
  }

  async function deleteInvestment(id) {
    if (!window.confirm('Eliminare questo investimento?')) return
    await window.electronAPI.investments.delete({ id })
    loadAll()
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function clearSelection() {
    setSelectedIds([])
    setLiquidateForm(emptyLiquidateForm)
    setLiquidateError('')
  }

  const selectedInvestments = investments.filter((inv) => selectedIds.includes(inv.id))
  const selectedAccountIds = [...new Set(selectedInvestments.map((inv) => inv.account_id))]
  const sameAccount = selectedAccountIds.length <= 1
  const liquidateAccountId = sameAccount ? selectedAccountIds[0] : null

  async function submitLiquidation(e) {
    e.preventDefault()
    setLiquidateError('')
    if (!sameAccount) {
      setLiquidateError('Gli investimenti selezionati devono appartenere allo stesso conto')
      return
    }
    const amount = Number(liquidateForm.amount)
    if (!liquidateForm.amount || Number.isNaN(amount) || amount <= 0) {
      setLiquidateError('Importo incassato non valido')
      return
    }
    if (!liquidateForm.date || !/^\d{4}-\d{2}-\d{2}$/.test(liquidateForm.date)) {
      setLiquidateError('Data non valida')
      return
    }
    try {
      await window.electronAPI.investments.liquidate({
        ids: selectedIds,
        amount,
        date: liquidateForm.date,
        note: liquidateForm.note.trim() || null
      })
      clearSelection()
      loadAll()
    } catch (err) {
      setLiquidateError(err.message || 'Liquidazione non riuscita')
    }
  }

  return (
    <div>
      <h1 className="page-title">Investimenti</h1>

      <div className="grid-4">
        <div className="card">
          <h2 className="card-title">Capitale investito</h2>
          <div className="stat-value">{formatMoney(capitaleInvestito)}</div>
        </div>
        <div className="card">
          <h2 className="card-title">Capitale a fine investimento</h2>
          <div className="stat-value">{formatMoney(capitaleFine)}</div>
        </div>
        <div className="card">
          <h2 className="card-title">Differenza</h2>
          <div className="stat-value">{formatMoney(differenza)}</div>
        </div>
        <div className="card">
          <h2 className="card-title">Rendimento netto</h2>
          <div className="stat-value">{formatPercent(rendimentoNettoPct)}</div>
        </div>
      </div>

      <div className="btn-row" style={{ marginBottom: 20 }}>
        <button className="btn btn-primary" title="Aggiungi investimento" onClick={openCreateForm}><i className="fa-solid fa-plus"></i></button>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editingId ? 'Modifica investimento' : 'Nuovo investimento'}</div>
              <button className="modal-close-btn" onClick={closeForm}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <form onSubmit={submitForm}>
              <div className="form-grid">
                <div className="field">
                  <label>Nome asset</label>
                  <input
                    value={form.asset_name}
                    onChange={(e) => setForm({ ...form, asset_name: e.target.value })}
                    list="known-asset-names"
                  />
                  <datalist id="known-asset-names">
                    {knownAssetNames.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  {errors.asset_name && <div className="field-error">{errors.asset_name}</div>}
                </div>
                <div className="field">
                  <label>Tipologia</label>
                  <select value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })}>
                    <option value="">Seleziona…</option>
                    {taxRates.map((r) => (
                      <option key={r.type} value={r.type}>{capitalize(r.type)} ({r.rate}%)</option>
                    ))}
                  </select>
                  {errors.tag && <div className="field-error">{errors.tag}</div>}
                </div>
                <div className="field">
                  <label>Conto di riferimento</label>
                  <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                    <option value="">Seleziona…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  {errors.account_id && <div className="field-error">{errors.account_id}</div>}
                </div>
                <div className="field">
                  <label>Prezzo acquisto unitario (€)</label>
                  <input type="number" step="0.0001" value={form.buy_price} onChange={(e) => setForm({ ...form, buy_price: e.target.value })} />
                  {errors.buy_price && <div className="field-error">{errors.buy_price}</div>}
                </div>
                <div className="field">
                  <label>Importo investito totale (€)</label>
                  <input type="number" step="0.01" value={form.amount_invested} onChange={(e) => setForm({ ...form, amount_invested: e.target.value })} />
                  {errors.amount_invested && <div className="field-error">{errors.amount_invested}</div>}
                </div>
                <div className="field">
                  <label>Prezzo target (€, opzionale)</label>
                  <input type="number" step="0.0001" value={form.target_price} onChange={(e) => setForm({ ...form, target_price: e.target.value })} />
                  {errors.target_price && <div className="field-error">{errors.target_price}</div>}
                </div>
                <div className="field">
                  <label>Data</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  {errors.date && <div className="field-error">{errors.date}</div>}
                </div>
              </div>
              <div className="btn-row">
                <button type="submit" className="btn btn-primary" title={editingId ? 'Salva modifiche' : 'Aggiungi investimento'}><i className="fa-solid fa-plus"></i></button>
                <button type="button" className="btn" title="Annulla" onClick={closeForm}><i className="fa-solid fa-xmark"></i></button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="card-title">Composizione portafoglio</h2>
        {composition.length === 0 ? (
          <div className="empty-state">Nessun investimento registrato</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={composition} dataKey="total" nameKey="tag" outerRadius={90} label={(d) => capitalize(d.tag)}>
                {composition.map((entry, i) => (
                  <Cell key={entry.tag} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatMoney(Number(v))} />
              <Legend formatter={(value) => capitalize(value)} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">Elenco investimenti</h2>
        {investments.length === 0 ? (
          <div className="empty-state">Nessun investimento registrato</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Asset</th>
                  <th>Tipo</th>
                  <th>Conto</th>
                  <th>Prezzo acq.</th>
                  <th>Investito</th>
                  <th>Target</th>
                  <th>Quantità</th>
                  <th>Plusv. lorda</th>
                  <th>Tasse</th>
                  <th>Plusv. netta</th>
                  <th>Rend. netto</th>
                  <th>Origine</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {investments.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <input type="checkbox" checked={selectedIds.includes(inv.id)} onChange={() => toggleSelected(inv.id)} />
                    </td>
                    <td>{inv.asset_name}</td>
                    <td>{capitalize(inv.tag)}</td>
                    <td>{accountName(inv.account_id)}</td>
                    <td>{formatMoney(inv.buy_price)}</td>
                    <td>{formatMoney(inv.amount_invested)}</td>
                    <td>{inv.target_price == null ? '—' : formatMoney(inv.target_price)}</td>
                    <td>{inv.quantita.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</td>
                    <td>{formatMoney(inv.plusvalenza_lorda)}</td>
                    <td>{formatMoney(inv.tasse)}</td>
                    <td>{formatMoney(inv.plusvalenza_netta)}</td>
                    <td>{formatPercent(inv.rendimento_netto_pct)}</td>
                    <td><span className={`badge badge-${inv.source}`}>{inv.source}</span></td>
                    <td>
                      <div className="btn-row">
                        <button className="icon-btn" title="Modifica" onClick={() => startEdit(inv)}>
                          <i className="fa-regular fa-pen-to-square"></i>
                        </button>
                        <button className="icon-btn danger" title="Elimina" onClick={() => deleteInvestment(inv.id)}>
                          <i className="fa-regular fa-trash-can"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="card">
          <h2 className="card-title">Liquida investimenti selezionati ({selectedIds.length})</h2>
          {!sameAccount ? (
            <div className="field-error">Gli investimenti selezionati devono appartenere allo stesso conto</div>
          ) : (
            <p>Conto di accredito: <strong>{accountName(liquidateAccountId)}</strong></p>
          )}
          <form onSubmit={submitLiquidation}>
            <div className="form-grid">
              <div className="field">
                <label>Importo incassato (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={liquidateForm.amount}
                  onChange={(e) => setLiquidateForm({ ...liquidateForm, amount: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Data</label>
                <input
                  type="date"
                  value={liquidateForm.date}
                  onChange={(e) => setLiquidateForm({ ...liquidateForm, date: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Nota</label>
                <input value={liquidateForm.note} onChange={(e) => setLiquidateForm({ ...liquidateForm, note: e.target.value })} />
              </div>
            </div>
            {liquidateError && <div className="field-error">{liquidateError}</div>}
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button type="submit" className="btn btn-primary" title="Liquida" disabled={!sameAccount}>
                <i className="fa-solid fa-money-bill-transfer"></i>
              </button>
              <button type="button" className="btn" title="Annulla selezione" onClick={clearSelection}><i className="fa-solid fa-xmark"></i></button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
