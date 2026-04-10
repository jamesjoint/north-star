const AVATAR_COLORS = ['#30C5FF', '#A0CB3B', '#FAB71F', '#EC5298', '#AF88FF', '#FF8C42']

export function avatarColor(email = '') {
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function initials(email = '') {
  const name = email.split('@')[0]
  const parts = name.split(/[._-]/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function companyInitials(name) {
  if (!name) return ''
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

/** Hash company name → a consistent hue 0–359. */
export function companyHue(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h)
  }
  return Math.abs(h) % 360
}

/** Return a saturated dark HSL background colour for a company name. */
export function companyBg(name) {
  const hue = companyHue(name || 'Unknown')
  return `hsl(${hue}, 50%, 32%)`
}
