/**
 * Convert an array of tracked jobs to a CSV string.
 * Pure function so it can be unit tested.
 */
export function jobsToCsv(jobs) {
  const HEADERS = ['Title', 'Company', 'Location', 'Status', 'Score', 'Salary Range', 'Applied Date', 'Follow-up Date', 'Notes', 'URL', 'Source']

  function escape(val) {
    if (val == null) return ''
    const str = String(val)
    // Wrap in quotes if the value contains commas, quotes, or newlines
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"'
    }
    return str
  }

  const rows = [HEADERS.join(',')]
  for (const job of jobs) {
    rows.push([
      escape(job.title),
      escape(job.company),
      escape(job.location),
      escape(job.status),
      escape(job.score_aggregate != null ? Number(job.score_aggregate).toFixed(1) : ''),
      escape(job.salary_range),
      escape(job.applied_date),
      escape(job.follow_up_date),
      escape(job.notes),
      escape(job.url),
      escape(job.source),
    ].join(','))
  }
  return rows.join('\n')
}

/**
 * Trigger a browser download of a CSV string.
 */
export function downloadCsv(csv, filename = 'tracker.csv') {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
