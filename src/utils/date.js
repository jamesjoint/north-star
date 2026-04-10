/**
 * Format a date string (YYYY-MM-DD or ISO) relative to now.
 * Returns human-friendly labels like "today", "3 days ago", "2 weeks ago".
 * Falls back to the YYYY-MM-DD string for older dates.
 *
 * @param {string|null} dateStr - YYYY-MM-DD or ISO date string
 * @param {Date} [now=new Date()] - current date (injectable for testing)
 * @returns {string}
 */
export function formatRelativeDate(dateStr, now = new Date()) {
  if (!dateStr) return ''
  // Normalize to YYYY-MM-DD
  const input = String(dateStr).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return dateStr

  const todayStr = localDateStr(now)
  const diffDays = dayDiff(todayStr, input)

  if (diffDays < 0) return input        // future
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 14) return '1 week ago'
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  if (diffDays < 60) return '1 month ago'
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
  if (diffDays < 730) return '1 year ago'
  return `${Math.floor(diffDays / 365)} years ago`
}

/** Format a Date object as YYYY-MM-DD in local time */
export function localDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Days between two YYYY-MM-DD strings (from - to, positive if from is later) */
function dayDiff(from, to) {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const fromMs = Date.UTC(fy, fm - 1, fd)
  const toMs = Date.UTC(ty, tm - 1, td)
  return Math.round((fromMs - toMs) / 86_400_000)
}
