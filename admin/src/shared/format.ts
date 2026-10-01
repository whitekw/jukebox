export function formatDate(timestamp: number | null | undefined) {
  if (timestamp == null) return '—'
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value)
}
