import { upsertJob, getJobById, makeId } from '../db.js'

export async function runAllScrapers(db, scrapers) {
  const newIds = []
  for (const scraper of scrapers) {
    try {
      const jobs = await scraper.scrape()
      for (const job of jobs) {
        const alreadyExists = !!getJobById(db, makeId(job.source, job.url))
        const id = upsertJob(db, job)
        if (!alreadyExists) newIds.push(id)
      }
    } catch (err) {
      console.error(`Scraper failed:`, err)
    }
  }
  return newIds
}
