import * as cheerio from 'cheerio'
import { chromium } from 'playwright'

export function parse(html) {
  const $ = cheerio.load(html)
  const jobs = []
  $('.job-card').each((_, el) => {
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
      location,
      remote: detectRemote(location),
      url: href.startsWith('http') ? href : `https://app.staffmeup.com${href}`,
      source: 'staffmeup',
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
    await page.goto('https://app.staffmeup.com/jobs?tab=jobs', { waitUntil: 'networkidle' })
    await page.waitForSelector('.job-card', { timeout: 10000 })
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
