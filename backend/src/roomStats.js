const DAY_MS = 86_400_000

function dateKey(date) {
  return date.toISOString().slice(0, 10)
}

function startOfWeek(date) {
  const monday = new Date(date)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  return monday
}

function buildPlaybackSeries(timestamps, now, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const localDateKey = (timestamp) => {
    const parts = Object.fromEntries(formatter.formatToParts(timestamp).map(({ type, value }) => [type, value]))
    return `${parts.year}-${parts.month}-${parts.day}`
  }
  const today = new Date(`${localDateKey(now)}T00:00:00Z`)
  const currentWeek = startOfWeek(today)
  const dayCounts = new Map()
  const weekCounts = new Map()
  const monthCounts = new Map()

  for (const timestamp of timestamps) {
    const day = localDateKey(timestamp)
    const week = dateKey(startOfWeek(new Date(`${day}T00:00:00Z`)))
    const month = day.slice(0, 7)
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1)
    weekCounts.set(week, (weekCounts.get(week) ?? 0) + 1)
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1)
  }

  const daily = Array.from({ length: 30 }, (_, index) => {
    const key = dateKey(new Date(today.getTime() - (29 - index) * DAY_MS))
    return { key, count: dayCounts.get(key) ?? 0 }
  })
  const weekly = Array.from({ length: 12 }, (_, index) => {
    const key = dateKey(new Date(currentWeek.getTime() - (11 - index) * 7 * DAY_MS))
    return { key, count: weekCounts.get(key) ?? 0 }
  })
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const month = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (11 - index), 1))
    const key = dateKey(month).slice(0, 7)
    return { key, count: monthCounts.get(key) ?? 0 }
  })
  return { daily, weekly, monthly }
}

module.exports = { buildPlaybackSeries }
