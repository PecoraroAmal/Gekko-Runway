export function formatMoney(n) {
  return n == null || Number.isNaN(n)
    ? '—'
    : `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`
}

export function formatPercent(n) {
  return n == null || Number.isNaN(n)
    ? '—'
    : `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!m) return dateStr
  return `${m[3]}/${m[2]}/${m[1]}`
}

export function capitalize(str) {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}
