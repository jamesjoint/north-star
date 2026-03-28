import * as cheerio from 'cheerio'
import axios from 'axios'
import { detectRemote } from './utils.js'

const BASE = 'https://ixda.org'

export function parse(html) {
  const $ = cheerio.load(html)
  const jobs = []
  $('.job-item').each((_, el) => {
    const titleEl = $(el).find('.job-title a')
    const title = titleEl.text().trim()
    const href = titleEl.attr('href')
    const company = $(el).find('.company').text().trim()
    const location = $(el).find('.location').text().trim()
    const description = $(el).find('.description').text().trim()
    if (!title || !href) return
    jobs.push({
      title,
      company,
      location: location || '',
      remote: detectRemote(location),
      url: href.startsWith('http') ? href : `${BASE}${href}`,
      source: 'ixda',
      posted_at: null,
      description,
    })
  })
  return jobs
}

export async function scrape() {
  const { data } = await axios.get(`${BASE}/jobs/`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  return parse(data)
}

