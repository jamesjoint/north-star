import * as cheerio from 'cheerio'
import { chromium } from './browser.js'
import { detectRemote } from './utils.js'

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
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.goto(`${BASE}/jobs/`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.job-listing', { timeout: 15000 }).catch(() => {})
    const html = await page.content()
    return parse(html)
  } finally {
    await browser.close()
  }
}
