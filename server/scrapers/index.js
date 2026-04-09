import { upsertJob, getJobById, makeId } from '../db.js'

export async function runAllScrapers(pool, scrapers) {
  const newIds = []
  for (const scraper of scrapers) {
    try {
      const jobs = await scraper.scrape()
      for (const job of jobs) {
        const alreadyExists = !!(await getJobById(pool, makeId(job.source, job.url)))
        const id = await upsertJob(pool, job)
        if (id && !alreadyExists) newIds.push(id)
      }
    } catch (err) {
      console.error(`Scraper failed:`, err)
    }
  }
  return newIds
}
