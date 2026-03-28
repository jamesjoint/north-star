export function detectRemote(location = '') {
  const l = location.toLowerCase()
  if (l.includes('remote') || l.includes('flexible')) return 'remote'
  if (l.includes('hybrid')) return 'hybrid'
  return 'onsite'
}
