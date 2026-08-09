import React, { useEffect, useState } from 'react'
import Heatmap from '../components/Heatmap.jsx'
import { formatMoney, formatPercent, useIsMobile, MONTH_NAMES } from '../utils.js'

export default function Dashboard({ refreshToken }) {
  const isMobile = useIsMobile()
  const [accounts, setAccounts] = useState([])
  const [salvadanaio, setSalvadanaio] = useState({ totalRoundup: 0, totalSaveback: 0 })
  const [totalInvested, setTotalInvested] = useState(0)
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear())
  const [heatmapMonth, setHeatmapMonth] = useState(new Date().getMonth())

  useEffect(() => {
    window.electronAPI.accounts.getAll().then(setAccounts)
    window.electronAPI.salvadanaio.get().then(setSalvadanaio)
    window.electronAPI.investments.getPortfolioComposition().then((rows) => {
      setTotalInvested(rows.reduce((sum, r) => sum + r.total, 0))
    })
  }, [refreshToken])

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)
  const grandTotal = totalBalance + totalInvested

  function heatmapPrev() {
    if (!isMobile) return setHeatmapYear((y) => y - 1)
    setHeatmapMonth((m) => {
      if (m === 0) {
        setHeatmapYear((y) => y - 1)
        return 11
      }
      return m - 1
    })
  }

  function heatmapNext() {
    if (!isMobile) return setHeatmapYear((y) => y + 1)
    setHeatmapMonth((m) => {
      if (m === 11) {
        setHeatmapYear((y) => y + 1)
        return 0
      }
      return m + 1
    })
  }

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>

      <div className="dashboard-top">
        <div className="grid-3">
          <div className="card">
            <h2 className="card-title">Saldo</h2>
            <div className="stat-value">{formatMoney(totalBalance)}</div>
          </div>
          <div className="card">
            <h2 className="card-title">Investimenti</h2>
            <div className="stat-value">{formatMoney(totalInvested)}</div>
          </div>
          <div className="card">
            <h2 className="card-title">Totale</h2>
            <div className="stat-value">{formatMoney(grandTotal)}</div>
          </div>
        </div>

        <div className="grid-stats-sm">
          <div className="card">
            <h2 className="card-title">Salvadanaio Roundup</h2>
            <div className="stat-value">{formatMoney(salvadanaio.totalRoundup)}</div>
          </div>
          <div className="card">
            <h2 className="card-title">Salvadanaio Saveback</h2>
            <div className="stat-value">{formatMoney(salvadanaio.totalSaveback)}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="heatmap-controls">
          <div className="heatmap-title">Attività</div>
          <div className="heatmap-nav">
            <button onClick={heatmapPrev}><i className="fa-solid fa-chevron-left"></i></button>
            <span className="heatmap-period-label">
              {isMobile ? `${MONTH_NAMES[heatmapMonth]} ${heatmapYear}` : heatmapYear}
            </span>
            <button onClick={heatmapNext}><i className="fa-solid fa-chevron-right"></i></button>
          </div>
        </div>
        <Heatmap year={heatmapYear} month={isMobile ? heatmapMonth : null} refreshToken={refreshToken} />
      </div>

      <div className="card">
        <details className="collapsible" open={!isMobile}>
          <summary className="card-title collapsible-summary">Saldo per conto</summary>
          {accounts.length === 0 ? (
            <div className="empty-state">Nessun conto creato</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Conto</th>
                  <th>Saldo</th>
                  <th>% del totale</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td><span className="color-dot" style={{ background: a.color }} /></td>
                    <td>{a.name}</td>
                    <td>{formatMoney(a.balance)}</td>
                    <td>{formatPercent(totalBalance !== 0 ? (a.balance / totalBalance) * 100 : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </details>
      </div>
    </div>
  )
}
