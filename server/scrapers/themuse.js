import axios from 'axios'

const BASE = 'https://www.themuse.com/api/public/jobs'
const CATEGORIES = ['Product Management', 'Business Development']

export async function scrape() {
  const all = []
  for (const category of CATEGORIES) {
    let page = 1
    while (page <= 3) {
      const { data } = await axios.get(BASE, {
        params: { category, page, descending: true }
      })
      const jobs = data.results.map(j => ({
        title: j.name,
        company: j.company?.name || '',
        location: j.locations?.[0]?.name || '',
        remote: detectRemote(j.locations?.[0]?.name || ''),
        url: j.refs?.landing_page || '',
        source: 'themuse',
        posted_at: j.publication_date ? j.publication_date.slice(0, 10) : null,
        description: j.contents ? j.contents.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '',
      }))
      all.push(...jobs)
      if (page >= data.page_count) break
      page++
      await sleep(1000)
    }
  }
  return all
}

function detectRemote(location = '') {
  const l = location.toLowerCase()
  if (l.includes('remote') || l.includes('flexible')) return 'remote'
  if (l.includes('hybrid')) return 'hybrid'
  return 'onsite'
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
