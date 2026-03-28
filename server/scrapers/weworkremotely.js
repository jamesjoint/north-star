import * as cheerio from 'cheerio'
import axios from 'axios'

const BASE = 'https://weworkremotely.com'

export function parse(html) {
  const $ = cheerio.load(html)
  const jobs = []
  $('section.jobs ul li').each((_, el) => {
    const a = $(el).find('a').first()
    const href = a.attr('href')
    if (!href || href === '#') return
    const title = a.find('span.title').text().trim()
    const company = a.find('span.company').text().trim()
    const region = a.find('span.region').text().trim().toLowerCase()
    if (!title) return
    jobs.push({
      title,
      company,
      location: region || 'Remote',
      remote: 'remote',
      url: href.startsWith('http') ? href : `${BASE}${href}`,
      source: 'weworkremotely',
      posted_at: null,
      description: '',
    })
  })
  return jobs
}

export async function scrape() {
  const categories = [
    '/remote-jobs/product',
    '/remote-jobs/business-exec',
  ]
  const all = []
  for (const cat of categories) {
    const { data } = await axios.get(`${BASE}${cat}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    all.push(...parse(data))
    await sleep(2000)
  }
  return all
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
