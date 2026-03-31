const BASE = '/api'

export async function fetchJobs() {
  const res = await fetch(`${BASE}/jobs`)
  if (!res.ok) throw new Error(`Failed to fetch jobs: ${res.status}`)
  return res.json()
}

export async function fetchJob(id) {
  const res = await fetch(`${BASE}/jobs/${id}`)
  if (!res.ok) throw new Error(`Failed to fetch job ${id}: ${res.status}`)
  return res.json()
}

export async function patchJob(id, updates) {
  const res = await fetch(`${BASE}/jobs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`Failed to update job ${id}: ${res.status}`)
  return res.json()
}

export async function triggerRefresh() {
  const res = await fetch(`${BASE}/refresh`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to trigger refresh: ${res.status}`)
  return res.json()
}
