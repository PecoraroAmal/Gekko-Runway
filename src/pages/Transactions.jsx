import React, { useEffect, useMemo, useState } from 'react'
import { formatMoney, formatDate } from '../utils.js'
import TransactionFormModal from '../components/TransactionFormModal.jsx'

export default function Transactions({ refreshToken }) {
  const [accounts, setAccounts] = useState([])
  const [allTags, setAllTags] = useState([])
  const [transactions, setTransactions] = useState([])

  const [filters, setFilters] = useState({ type: '', accountId: '', tag: '', dateFrom: '', dateTo: '' })

  const [editingTx, setEditingTx] = useState(null)
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

  function startEdit(tx) {
    setEditingTx(tx)
    setShowForm(true)
  }

  function openCreateForm() {
    setEditingTx(null)
    setShowForm(true)
  }

  function closeForm() {
    setEditingTx(null)
    setShowForm(false)
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

      <TransactionFormModal
        open={showForm}
        transaction={editingTx}
        onClose={closeForm}
        onSaved={loadTransactions}
      />

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
