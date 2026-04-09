import * as cheerio from 'cheerio'
import { launch } from './browser.js'

const BASE = 'https://builtin.com'
const CATEGORIES = [
  'product-management',
  'business-development',
]

export function parse(html) {
  const $ = cheerio.load(html)
  const jobs = []

  $('[data-id="job-card"]').each((_, el) => {
    const titleEl = $(el).find('[data-id="job-card-title"]')
    const title = titleEl.text().trim()
    const href = titleEl.attr('href')
    if (!title || !href) return

    const company = $(el).find('[data-id="company-title"]').text().trim()

    // Icon is nested: i → div.d-flex → div.d-flex.gap-sm (which also contains the span)
    const remoteText = $(el).find('.fa-house-building').parent().parent().find('span.font-barlow').text().trim().toLowerCase()
    const location = $(el).find('.fa-location-dot').parent().parent().find('span.font-barlow').text().trim()

    let remote = 'unknown'
    if (remoteText.includes('remote') && remoteText.includes('hybrid')) remote = 'hybrid'
    else if (remoteText.includes('remote')) remote = 'remote'
    else if (remoteText.includes('hybrid')) remote = 'hybrid'
    else if (remoteText.includes('in-office') || remoteText.includes('on-site')) remote = 'onsite'

    jobs.push({
      title,
      company,
      location: location || '',
      remote,
      url: href.startsWith('http') ? href : `${BASE}${href}`,
      source: 'builtin',
      posted_at: null,
      description: '',
    })
  })

  return jobs
}

export async function scrape() {
  const all = []
  const browser = await launch()
  try {
    for (const cat of CATEGORIES) {
      const page = await browser.newPage()
      try {
        await page.goto(`${BASE}/jobs?job_function[]=${cat}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await page.waitForSelector('[data-id="job-card"]', { timeout: 15000 }).catch(() => {})
        const html = await page.content()
        all.push(...parse(html))
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
  return all
}
