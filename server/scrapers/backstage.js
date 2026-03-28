import * as cheerio from 'cheerio'
import { chromium } from 'playwright'

export function parse(html) {
  const $ = cheerio.load(html)
  const jobs = []
  $('.job-listing-item').each((_, el) => {
    const a = $(el).find('.job-listing-link')
    const href = a.attr('href')
    const title = $(el).find('.job-listing-name').text().trim()
    const company = $(el).find('.job-listing-company').text().trim()
    const location = $(el).find('.job-listing-location').text().trim()
    if (!title || !href) return
    jobs.push({
      title,
      company,
      location,
      remote: detectRemote(location),
      url: href.startsWith('http') ? href : `https://www.backstage.com${href}`,
      source: 'backstage',
      posted_at: null,
      description: '',
    })
  })
  return jobs
}

export async function scrape() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.goto('https://www.backstage.com/casting/', { waitUntil: 'networkidle' })
    const html = await page.content()
    return parse(html)
  } finally {
    await browser.close()
  }
}

function detectRemote(location = '') {
  const l = location.toLowerCase()
  if (l.includes('remote')) return 'remote'
  if (l.includes('hybrid')) return 'hybrid'
  return 'onsite'
}
