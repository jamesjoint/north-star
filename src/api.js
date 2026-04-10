const BASE = '/api'

export class AuthExpiredError extends Error {
  constructor() { super('auth_expired'); this.name = 'AuthExpiredError' }
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options })
  if (res.status === 401 && !url.includes('/auth/')) {
    window.dispatchEvent(new CustomEvent('auth:expired'))
    throw new AuthExpiredError()
  }
  return res
}

export async function fetchCurrentUser() {
  const res = await apiFetch(`${BASE}/auth/me`)
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`Failed to fetch user: ${res.status}`)
  return res.json()
}

export async function signup(email) {
  const res = await apiFetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  return res
}

export async function signOut() {
  await apiFetch(`${BASE}/auth/sign-out`, { method: 'POST' })
}

export async function sendMagicLink(email) {
  const res = await apiFetch(`${BASE}/auth/sign-in/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  return res
}

export async function fetchJobs() {
  const res = await apiFetch(`${BASE}/jobs`)
  if (!res.ok) throw new Error(`Failed to fetch jobs: ${res.status}`)
  return res.json()
}

export async function fetchJob(id) {
  const res = await apiFetch(`${BASE}/jobs/${id}`)
  if (!res.ok) throw new Error(`Failed to fetch job ${id}: ${res.status}`)
  return res.json()
}

export async function patchJob(id, updates) {
  const res = await apiFetch(`${BASE}/jobs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`Failed to update job ${id}: ${res.status}`)
  return res.json()
}

export async function createJob(data) {
  const res = await apiFetch(`${BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to add job: ${res.status}`)
  return res.json()
}

export async function patchJobDescription(id, description) {
  const res = await apiFetch(`/api/jobs/${id}/description`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  })
  if (!res.ok) throw new Error(`Failed to update description: ${res.status}`)
}

export async function deleteJob(id) {
  const res = await apiFetch(`${BASE}/jobs/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete job ${id}: ${res.status}`)
}

export async function triggerRefresh() {
  const res = await apiFetch(`${BASE}/refresh`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to trigger refresh: ${res.status}`)
  return res.json()
}

export async function fetchProfile() {
  const res = await apiFetch(`${BASE}/profile`)
  if (!res.ok) throw new Error(`Failed to fetch profile: ${res.status}`)
  return res.json()
}

export async function patchBackground(background) {
  const res = await apiFetch(`${BASE}/profile/background`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ background }),
  })
  if (!res.ok) throw new Error(`Failed to save background: ${res.status}`)
  return res.json()
}

// ── Admin ──────────────────────────────────────────────────────────────────────

export async function redeemInvite(code, email) {
  const res = await apiFetch(`${BASE}/invites/${code}/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  return res
}

export async function fetchInvites() {
  const res = await apiFetch(`${BASE}/invites`)
  if (!res.ok) throw new Error(`Failed to fetch invites: ${res.status}`)
  return res.json()
}

export async function createInvite(expiresInDays = 7) {
  const res = await apiFetch(`${BASE}/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresInDays }),
  })
  if (!res.ok) throw new Error(`Failed to create invite: ${res.status}`)
  return res.json()
}

export async function revokeInvite(code) {
  const res = await apiFetch(`${BASE}/invites/${code}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to revoke invite: ${res.status}`)
}

export async function fetchWaitlist() {
  const res = await apiFetch(`${BASE}/admin/waitlist`)
  if (!res.ok) throw new Error(`Failed to fetch waitlist: ${res.status}`)
  return res.json()
}

export async function approveUser(userId) {
  const res = await apiFetch(`${BASE}/admin/waitlist/${userId}/approve`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to approve user: ${res.status}`)
  return res.json()
}

export async function rejectUser(userId) {
  const res = await apiFetch(`${BASE}/admin/waitlist/${userId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to reject user: ${res.status}`)
}

export async function fetchAdminUsers() {
  const res = await apiFetch(`${BASE}/admin/users`)
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`)
  return res.json()
}

export async function deactivateUser(userId) {
  const res = await apiFetch(`${BASE}/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'deactivated' }),
  })
  if (!res.ok) throw new Error(`Failed to deactivate user: ${res.status}`)
  return res.json()
}

export async function reactivateUser(userId) {
  const res = await apiFetch(`${BASE}/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'active' }),
  })
  if (!res.ok) throw new Error(`Failed to reactivate user: ${res.status}`)
  return res.json()
}

export async function fetchBoards() {
  const res = await apiFetch(`${BASE}/boards`)
  if (!res.ok) throw new Error(`Failed to fetch boards: ${res.status}`)
  return res.json()
}

export async function createBoardApi(name, emoji) {
  const res = await apiFetch(`${BASE}/boards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, emoji }),
  })
  if (!res.ok) throw new Error(`Failed to create board: ${res.status}`)
  return res.json()
}

export async function updateBoardApi(id, updates) {
  const res = await apiFetch(`${BASE}/boards/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`Failed to update board: ${res.status}`)
}

export async function deleteBoardApi(id) {
  const res = await apiFetch(`${BASE}/boards/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete board: ${res.status}`)
}

export async function patchWeights(weights) {
  const res = await apiFetch(`${BASE}/profile/weights`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weights }),
  })
  if (!res.ok) throw new Error(`Failed to save weights: ${res.status}`)
  return res.json()
}

export async function fetchScoringQueue() {
  const res = await apiFetch(`${BASE}/admin/scoring`)
  if (!res.ok) throw new Error(`Failed to fetch scoring queue: ${res.status}`)
  return res.json()
}

export async function patchPersonality(personality) {
  const res = await apiFetch(`${BASE}/profile/personality`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personality }),
  })
  if (!res.ok) throw new Error(`Failed to save personality: ${res.status}`)
  return res.json()
}

export async function patchDimensions(dimensions) {
  const res = await apiFetch(`${BASE}/profile/dimensions`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dimensions }),
  })
  if (!res.ok) throw new Error(`Failed to save dimensions: ${res.status}`)
  return res.json()
}

export async function regenerateDimensions() {
  const res = await apiFetch(`${BASE}/profile/dimensions/regenerate`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to regenerate dimensions: ${res.status}`)
  return res.json()
}

export async function fetchRescoreStatus() {
  const res = await apiFetch(`${BASE}/rescore-status`)
  if (!res.ok) throw new Error(`Failed to fetch rescore status: ${res.status}`)
  return res.json()
}
