/**
 * Sanitize a personality object before saving:
 * - Removes keys with empty/whitespace-only values
 * - Converts a comma-separated strengths string to an array (max 5 items)
 */
export function cleanPersonality(p) {
  const clean = Object.fromEntries(
    Object.entries(p).filter(([, v]) => v && String(v).trim())
  )
  if (typeof clean.strengths === 'string') {
    clean.strengths = clean.strengths
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 5)
  }
  return clean
}
