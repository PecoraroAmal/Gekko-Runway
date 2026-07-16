import React, { useEffect, useState } from 'react'
import { formatMoney, capitalize } from '../utils.js'

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
]

function formatDate(d) {
  return d.toISOString().slice(0, 10)
}

function buildMonthsForYear(year) {
  const months = []
  for (let m = 0; m < 12; m++) {
    const daysInMonth = new Date(Date.UTC(year, m + 1, 0)).getUTCDate()
    const days = []
    // padding iniziale: allinea la prima colonna a lunedì e l'ultima a domenica
    const firstWeekday = new Date(Date.UTC(year, m, 1)).getUTCDay() // 0=domenica...6=sabato
    const leading = (firstWeekday + 6) % 7 // 0=lunedì...6=domenica
    for (let i = 0; i < leading; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(Date.UTC(year, m, d)))
    }
    // padding finale: celle vuote per completare l'ultima riga da 7
    const trailing = (7 - (days.length % 7)) % 7
    for (let i = 0; i < trailing; i++) days.push(null)
    months.push({ month: m, days })
  }
  return months
}

function cellStyle(entry) {
  if (!entry) return { background: 'var(--heatmap-empty)' }
  const { uscita, investimento } = entry
  // le entrate sotto 1€ (es. arrotondamenti, interessi) non colorano la cella
  const entrata = entry.entrata < 1 ? 0 : entry.entrata
  const total = entrata + uscita + investimento
  if (total === 0) return { background: 'var(--heatmap-empty)' }
  const pctEntrata = (entrata / total) * 100
  const pctUscita = (uscita / total) * 100
  const boundary1 = pctEntrata
  const boundary2 = pctEntrata + pctUscita
  return {
    background: `linear-gradient(to right,
      var(--heatmap-entrata) 0%, var(--heatmap-entrata) ${boundary1}%,
      var(--heatmap-uscita) ${boundary1}%, var(--heatmap-uscita) ${boundary2}%,
      var(--heatmap-investimento) ${boundary2}%, var(--heatmap-investimento) 100%)`
  }
}

function cellTitle(dateStr, entry) {
  if (!entry) return `${dateStr}: nessuna attività`
  return `${dateStr}\nEntrate: ${formatMoney(entry.entrata)}\nUscite: ${formatMoney(entry.uscita)}\nInvestimenti: ${formatMoney(entry.investimento)}`
}

export default function Heatmap({ year, refreshToken }) {
  const [dataByDate, setDataByDate] = useState({})
  const [accounts, setAccounts] = useState([])
  const [selectedDate, setSelectedDate] = useState(null)
  const [dayTransactions, setDayTransactions] = useState([])
  const [dayInvestments, setDayInvestments] = useState([])

  useEffect(() => {
    let cancelled = false
    window.electronAPI.heatmap.getData({ year }).then((rows) => {
      if (cancelled) return
      const map = {}
      rows.forEach((r) => {
        map[r.date] = r
      })
      setDataByDate(map)
    })
    window.electronAPI.accounts.getAll().then((rows) => {
      if (!cancelled) setAccounts(rows)
    })
    return () => {
      cancelled = true
    }
  }, [year, refreshToken])

  function accountName(id) {
    const a = accounts.find((acc) => acc.id === id)
    return a ? a.name : '—'
  }

  function openDay(dateStr) {
    setSelectedDate(dateStr)
    Promise.all([
      window.electronAPI.transactions.getAll({ dateFrom: dateStr, dateTo: dateStr }),
      window.electronAPI.investments.getAll()
    ]).then(([txs, invs]) => {
      setDayTransactions(txs)
      setDayInvestments(invs.filter((inv) => inv.date === dateStr))
    })
  }

  const months = buildMonthsForYear(year)
  const todayStr = formatDate(new Date())

  return (
    <div>
      <div className="heatmap-wrapper">
        <div className="heatmap-months heatmap-cell-size">
          {months.map((m) => (
            <div key={m.month} className="heatmap-month-block">
              <div className="heatmap-month-label">{MONTH_NAMES[m.month]}</div>
              <div className="heatmap-month-grid">
                {m.days.map((day, di) => {
                  if (!day) return <div key={di} className="heatmap-cell heatmap-cell-empty" style={{ visibility: 'hidden' }} />
                  const dateStr = formatDate(day)
                  const entry = dataByDate[dateStr]
                  const isToday = dateStr === todayStr
                  return (
                    <div
                      key={di}
                      className={`heatmap-cell${isToday ? ' heatmap-cell-today' : ''}`}
                      style={cellStyle(entry)}
                      title={cellTitle(dateStr, entry)}
                      onClick={() => openDay(dateStr)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="heatmap-legend">
        <span><span className="heatmap-legend-swatch" style={{ background: 'var(--heatmap-entrata)' }} />Entrate</span>
        <span><span className="heatmap-legend-swatch" style={{ background: 'var(--heatmap-uscita)' }} />Uscite</span>
        <span><span className="heatmap-legend-swatch" style={{ background: 'var(--heatmap-investimento)' }} />Investimenti</span>
      </div>

      {selectedDate && (
        <div className="modal-backdrop" onClick={() => setSelectedDate(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{selectedDate}</div>
              <button className="modal-close-btn" onClick={() => setSelectedDate(null)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="modal-section-title">Entrate / Uscite</div>
            {dayTransactions.length === 0 ? (
              <div className="empty-state">Nessun movimento in questo giorno</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Importo</th>
                    <th>Conto</th>
                    <th>Tag</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {dayTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{tx.type === 'entrata' ? 'Entrata' : 'Uscita'}</td>
                      <td>{formatMoney(tx.amount)}</td>
                      <td>{accountName(tx.account_id)}</td>
                      <td>{tx.tag || '—'}</td>
                      <td>{tx.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="modal-section-title">Investimenti</div>
            {dayInvestments.length === 0 ? (
              <div className="empty-state">Nessun investimento in questo giorno</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Tipologia</th>
                    <th>Investito</th>
                  </tr>
                </thead>
                <tbody>
                  {dayInvestments.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.asset_name}</td>
                      <td>{capitalize(inv.tag)}</td>
                      <td>{formatMoney(inv.amount_invested)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
