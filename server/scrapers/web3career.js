import * as cheerio from 'cheerio'
import { launch } from './browser.js'
import { detectRemote } from './utils.js'

export function parse(html) {
  const $ = cheerio.load(html)
  const jobs = []
  $('#jobs-list .job-card, .job-card').each((_, el) => {
    const titleEl = $(el).find('.job-title-link, h2 a').first()
    const title = titleEl.text().trim()
    const href = titleEl.attr('href')
    const company = $(el).find('.company-name').text().trim()
    const location = $(el).find('.job-location').text().trim()
    const description = $(el).find('.job-description').text().trim()
    if (!title || !href) return
    jobs.push({
      title,
      company,
      location,
      remote: detectRemote(location),
      url: href.startsWith('http') ? href : `https://web3.career${href}`,
      source: 'web3career',
      posted_at: null,
      description,
    })
  })
  return jobs
}

export async function scrape() {
  const browser = await launch()
  const page = await browser.newPage()
  try {
    await page.goto('https://web3.career/', { waitUntil: 'networkidle' })
    await page.waitForSelector('.job-card', { timeout: 10000 })
    const html = await page.content()
    return parse(html)
  } finally {
    await browser.close()
  }
}

