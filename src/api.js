const BASE = '/api'

async function apiFetch(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options })
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

export async function patchWeights(weights) {
  const res = await apiFetch(`${BASE}/profile/weights`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weights }),
  })
  if (!res.ok) throw new Error(`Failed to save weights: ${res.status}`)
  return res.json()
}

export async function fetchRescoreStatus() {
  const res = await apiFetch(`${BASE}/rescore-status`)
  if (!res.ok) throw new Error(`Failed to fetch rescore status: ${res.status}`)
  return res.json()
}
