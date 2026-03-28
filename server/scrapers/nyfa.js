import * as cheerio from 'cheerio'
import axios from 'axios'

const BASE = 'https://www.nyfa.org'

export function parse(html) {
  const $ = cheerio.load(html)
  const jobs = []
  $('.job-listing').each((_, el) => {
    const titleEl = $(el).find('.job-title a')
    const title = titleEl.text().trim()
    const href = titleEl.attr('href')
    const company = $(el).find('.company-name').text().trim()
    const location = $(el).find('.job-location').text().trim()
    const description = $(el).find('.job-description').text().trim()
    if (!title || !href) return
    jobs.push({
      title,
      company,
      location: location || 'New York, NY',
      remote: detectRemote(location),
      url: href.startsWith('http') ? href : `${BASE}${href}`,
      source: 'nyfa',
      posted_at: null,
      description,
    })
  })
  return jobs
}

export async function scrape() {
  const { data } = await axios.get(`${BASE}/jobs/?_page=1`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  return parse(data)
}

function detectRemote(location = '') {
  const l = location.toLowerCase()
  if (l.includes('remote')) return 'remote'
  if (l.includes('hybrid')) return 'hybrid'
  return 'onsite'
}
