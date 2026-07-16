import React, { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatMoney } from '../utils.js'

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
]

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const emptyForm = {
  name: '',
  amount: '',
  frequency: 'mensile',
  day_of_month: '1',
  month_of_year: '1',
  active: true,
  start_date: todayStr(),
  end_date: ''
}

function validateRecurringForm(values) {
  const errors = {}
  if (!values.name.trim()) errors.name = 'Nome obbligatorio'
  const amount = Number(values.amount)
  if (!values.amount || Number.isNaN(amount) || amount <= 0) errors.amount = 'Importo non valido'
  const day = Number(values.day_of_month)
  if (!values.day_of_month || Number.isNaN(day) || day < 1 || day > 31) errors.day_of_month = 'Giorno non valido (1-31)'
  if (values.frequency === 'annuale') {
    const month = Number(values.month_of_year)
    if (!values.month_of_year || Number.isNaN(month) || month < 1 || month > 12) errors.month_of_year = 'Mese non valido'
  }
  if (!values.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(values.start_date)) errors.start_date = 'Data inizio non valida'
  if (values.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(values.end_date)) errors.end_date = 'Data fine non valida'
  if (values.start_date && values.end_date && values.end_date < values.start_date) {
    errors.end_date = 'La data fine deve essere successiva alla data inizio'
  }
  return errors
}

export default function Previsioni({ refreshToken }) {
  const [expenses, setExpenses] = useState([])
  const [forecast, setForecast] = useState({ avgMonthlyExpense: 0, startDate: null, endDate: null, endBalance: 0, months: [] })

  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [errors, setErrors] = useState({})

  function loadAll() {
    window.electronAPI.recurringExpenses.getAll().then(setExpenses)
    window.electronAPI.forecast.getData().then(setForecast)
  }

  useEffect(loadAll, [refreshToken])

  function startEdit(exp) {
    setEditingId(exp.id)
    setForm({
      name: exp.name,
      amount: String(exp.amount),
      frequency: exp.frequency,
      day_of_month: String(exp.day_of_month),
      month_of_year: exp.month_of_year == null ? '1' : String(exp.month_of_year),
      active: !!exp.active,
      start_date: exp.start_date || todayStr(),
      end_date: exp.end_date || ''
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
    const validationErrors = validateRecurringForm(form)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    const payload = {
      name: form.name.trim(),
      amount: Number(form.amount),
      frequency: form.frequency,
      day_of_month: Number(form.day_of_month),
      month_of_year: form.frequency === 'annuale' ? Number(form.month_of_year) : null,
      active: form.active,
      start_date: form.start_date,
      end_date: form.end_date === '' ? null : form.end_date
    }

    if (editingId) {
      await window.electronAPI.recurringExpenses.update({ id: editingId, fields: payload })
    } else {
      await window.electronAPI.recurringExpenses.create(payload)
    }
    cancelEdit()
    loadAll()
  }

  async function deleteExpense(id) {
    if (!window.confirm('Eliminare questa spesa ciclica?')) return
    await window.electronAPI.recurringExpenses.delete({ id })
    loadAll()
  }

  return (
    <div>
      <h1 className="page-title">Previsioni</h1>

      <div className="stats-row">
        <div className="card">
          <h2 className="card-title">Media mensile storica uscite</h2>
          <div className="stat-value">{formatMoney(forecast.avgMonthlyExpense)}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--fg-muted)' }}>
            {forecast.startDate ? `dal ${forecast.startDate}` : 'su tutto lo storico'}
          </div>
        </div>
        <div className="card">
          <h2 className="card-title">Saldo a fine proiezione</h2>
          <div className="stat-value">{formatMoney(forecast.endBalance)}</div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Proiezione saldo</h2>
        {forecast.months.length === 0 ? (
          <div className="empty-state">Nessun dato disponibile</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={forecast.months}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toLocaleString('it-IT')}€`} />
              <Tooltip formatter={(v) => formatMoney(Number(v))} />
              <Line type="monotone" dataKey="projectedBalance" stroke="#5b9bd5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">{editingId ? 'Modifica spesa ciclica' : 'Nuova spesa ciclica'}</h2>
        <form onSubmit={submitForm}>
          <div className="form-grid">
            <div className="field">
              <label>Nome</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {errors.name && <div className="field-error">{errors.name}</div>}
            </div>
            <div className="field">
              <label>Importo (€)</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              {errors.amount && <div className="field-error">{errors.amount}</div>}
            </div>
            <div className="field">
              <label>Frequenza</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                <option value="mensile">Mensile</option>
                <option value="annuale">Annuale</option>
              </select>
            </div>
            <div className="field">
              <label>Giorno del mese</label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.day_of_month}
                onChange={(e) => setForm({ ...form, day_of_month: e.target.value })}
              />
              {errors.day_of_month && <div className="field-error">{errors.day_of_month}</div>}
            </div>
            {form.frequency === 'annuale' && (
              <div className="field">
                <label>Mese</label>
                <select value={form.month_of_year} onChange={(e) => setForm({ ...form, month_of_year: e.target.value })}>
                  {MONTH_NAMES.map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </select>
                {errors.month_of_year && <div className="field-error">{errors.month_of_year}</div>}
              </div>
            )}
            <div className="field">
              <label>Data inizio</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              {errors.start_date && <div className="field-error">{errors.start_date}</div>}
            </div>
            <div className="field">
              <label>Data fine (opzionale)</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              {errors.end_date && <div className="field-error">{errors.end_date}</div>}
            </div>
          </div>

          <div className="checkbox-field">
            <input
              type="checkbox"
              id="recurring_active"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <label htmlFor="recurring_active">Attiva</label>
          </div>

          <div className="btn-row">
            <button type="submit" className="btn btn-primary"><i className="fa-solid fa-plus"></i>{editingId ? 'Salva modifiche' : 'Aggiungi spesa ciclica'}</button>
            {editingId && <button type="button" className="btn" onClick={cancelEdit}>Annulla</button>}
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="card-title">Spese cicliche</h2>
        {expenses.length === 0 ? (
          <div className="empty-state">Nessuna spesa ciclica configurata</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Importo</th>
                <th>Frequenza</th>
                <th>Giorno</th>
                <th>Mese</th>
                <th>Inizio</th>
                <th>Fine</th>
                <th>Totale</th>
                <th>Attiva</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp) => (
                <tr key={exp.id}>
                  <td>{exp.name}</td>
                  <td>{formatMoney(exp.amount)}</td>
                  <td>{exp.frequency === 'mensile' ? 'Mensile' : 'Annuale'}</td>
                  <td>{exp.day_of_month}</td>
                  <td>{exp.month_of_year == null ? '—' : MONTH_NAMES[exp.month_of_year - 1]}</td>
                  <td>{exp.start_date || '—'}</td>
                  <td>{exp.end_date || '—'}</td>
                  <td>{exp.totale == null ? '—' : formatMoney(exp.totale)}</td>
                  <td>{exp.active ? 'Sì' : 'No'}</td>
                  <td>
                    <div className="btn-row">
                      <button className="icon-btn" title="Modifica" onClick={() => startEdit(exp)}>
                        <i className="fa-regular fa-pen-to-square"></i>
                      </button>
                      <button className="icon-btn danger" title="Elimina" onClick={() => deleteExpense(exp.id)}>
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
