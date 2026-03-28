import * as cheerio from 'cheerio'
import { chromium } from 'playwright'
import { detectRemote } from './utils.js'

export function parse(html) {
  const $ = cheerio.load(html)
  const jobs = []
  $('.job-card').each((_, el) => {
    const a = $(el).find('.job-link, a').first()
    const href = a.attr('href')
    const title = $(el).find('.job-title').text().trim()
    const company = $(el).find('.company').text().trim()
    const location = $(el).find('.location').text().trim()
    const description = $(el).find('.description').text().trim()
    if (!title || !href) return
    jobs.push({
      title,
      company,
      location,
      remote: detectRemote(location),
      url: href.startsWith('http') ? href : `https://creatoreconomyjobs.co${href}`,
      source: 'creatoreconomyjobs',
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
    await page.goto('https://creatoreconomyjobs.co/', { waitUntil: 'networkidle' })
    await page.waitForSelector('.job-card', { timeout: 10000 })
    const html = await page.content()
    return parse(html)
  } finally {
    await browser.close()
  }
}

