import React, { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard.jsx'
import Accounts from './pages/Accounts.jsx'
import Transactions from './pages/Transactions.jsx'
import Investments from './pages/Investments.jsx'
import Previsioni from './pages/Previsioni.jsx'
import Settings from './pages/Settings.jsx'
import TransactionFormModal from './components/TransactionFormModal.jsx'

const PAGES = [
  { key: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-tachograph-digital' },
  { key: 'accounts', label: 'Conti', icon: 'fa-solid fa-wallet' },
  { key: 'transactions', label: 'Movimenti', icon: 'fa-solid fa-right-left' },
  { key: 'investments', label: 'Investimenti', icon: 'fa-solid fa-chart-line' },
  { key: 'previsioni', label: 'Previsioni', icon: 'fa-solid fa-chart-column' },
  { key: 'settings', label: 'Impostazioni', icon: 'fa-solid fa-gear' }
]

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [theme, setTheme] = useState('light')
  const [refreshToken, setRefreshToken] = useState(0)
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  useEffect(() => {
    window.electronAPI.settings.getAll().then((s) => {
      const initialTheme = s.theme === 'dark' ? 'dark' : 'light'
      setTheme(initialTheme)
      document.documentElement.setAttribute('data-theme', initialTheme)
    })

    const unsubscribe = window.electronAPI.onDataChanged(() => {
      setRefreshToken((t) => t + 1)
    })
    return unsubscribe
  }, [])

  async function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    await window.electronAPI.settings.set({ key: 'theme', value: next })
  }

  return (
    <div className="app-shell">
      <div className="sidebar">
        {PAGES.map((p) => (
          <div
            key={p.key}
            className={`nav-item nav-item-${p.key} ${page === p.key ? 'active' : ''}`}
            onClick={() => setPage(p.key)}
            title={p.label}
          >
            <i className={p.icon}></i>
          </div>
        ))}
      </div>
      <div className="main-content">
        {page === 'dashboard' && <Dashboard refreshToken={refreshToken} />}
        {page === 'accounts' && <Accounts refreshToken={refreshToken} />}
        {page === 'transactions' && <Transactions refreshToken={refreshToken} />}
        {page === 'investments' && <Investments refreshToken={refreshToken} />}
        {page === 'previsioni' && <Previsioni refreshToken={refreshToken} />}
        {page === 'settings' && <Settings refreshToken={refreshToken} theme={theme} onToggleTheme={toggleTheme} />}
      </div>

      {page === 'dashboard' && (
        <>
          <button className="fab-add-transaction" onClick={() => setShowQuickAdd(true)} title="Aggiungi movimento">
            <i className="fa-solid fa-circle-plus"></i>
          </button>
          <TransactionFormModal open={showQuickAdd} transaction={null} onClose={() => setShowQuickAdd(false)} />
        </>
      )}
    </div>
  )
}
