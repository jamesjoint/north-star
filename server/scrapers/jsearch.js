import axios from 'axios'
import { detectRemote } from './utils.js'

const QUERIES = [
  'Chief of Staff NYC',
  'Partnerships Manager creator economy',
  'Product Manager wellness NYC',
  'Creator Solutions Manager',
  'Lifestyle Partnerships',
]

export async function scrape() {
  if (!process.env.RAPIDAPI_KEY) {
    console.warn('JSearch scraper: RAPIDAPI_KEY not set, skipping')
    return []
  }

  const seen = new Set()
  const jobs = []

  for (const query of QUERIES) {
    try {
      const { data } = await axios.get('https://jsearch.p.rapidapi.com/search', {
        params: { query, num_pages: '1' },
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
      })
      console.log(`[jsearch] query="${query}" status=${data.status} jobs=${(data.data || []).length}`)
      for (const job of (data.data || [])) {
        const url = job.job_apply_link
        if (!url || seen.has(url)) continue
        seen.add(url)
        const location = [job.job_city, job.job_state].filter(Boolean).join(', ')
        jobs.push({
          title: job.job_title || '',
          company: job.employer_name || '',
          location,
          remote: job.job_is_remote ? 'remote' : detectRemote(location),
          url,
          source: 'jsearch',
          posted_at: job.job_posted_at_datetime_utc
            ? job.job_posted_at_datetime_utc.slice(0, 10)
            : null,
          description: job.job_description || '',
        })
      }
    } catch (err) {
      console.error(`JSearch scraper: query "${query}" failed:`, err.message)
    }
  }

  return jobs
}
