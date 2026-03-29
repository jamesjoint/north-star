import * as cheerio from 'cheerio'
import { launch } from './browser.js'
import { detectRemote } from './utils.js'

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
  const browser = await launch()
  const page = await browser.newPage()
  try {
    await page.goto('https://www.backstage.com/casting/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.job-listing-item', { timeout: 10000 }).catch(() => {})
    const html = await page.content()
    return parse(html)
  } finally {
    await browser.close()
  }
}

