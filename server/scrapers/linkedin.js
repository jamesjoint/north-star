import { detectRemote } from './utils.js'

// Action name — check your Composio dashboard under LinkedIn actions.
// Common values: LINKEDIN_SEARCH_JOBS, LINKEDIN_SEARCH_JOB_POSTINGS
// Override via LINKEDIN_ACTION env var.
const LINKEDIN_ACTION = process.env.LINKEDIN_ACTION || 'LINKEDIN_SEARCH_JOBS'

export async function scrape() {
  // Dynamically import composio-core to handle the deprecated package gracefully
  let toolset
  try {
    const { OpenAIToolSet } = await import('composio-core')
    toolset = new OpenAIToolSet({ apiKey: process.env.COMPOSIO_API_KEY })
  } catch (err) {
    console.error('LinkedIn scraper: failed to load composio-core:', err.message)
    return []
  }

  console.log(`[linkedin] Using action: ${LINKEDIN_ACTION}`)
  let result
  try {
    result = await toolset.executeAction({
      action: LINKEDIN_ACTION,
      params: {
        keywords: 'product manager OR partnerships manager OR head of product OR business development',
        location: 'New York, NY',
        count: 50,
      },
      entityId: 'default',
    })
  } catch (err) {
    console.error('LinkedIn scraper: executeAction failed:', err.message)
    return []
  }

  if (!result?.data?.elements) {
    console.warn('LinkedIn scraper: unexpected response shape', JSON.stringify(result).slice(0, 200))
    return []
  }

  return result.data.elements.map(job => ({
    title: job.title || job.position || '',
    company: job.companyName || job.company?.name || '',
    location: job.formattedLocation || job.location || 'New York, NY',
    remote: detectRemote(job.workplaceType || job.formattedLocation || ''),
    url: job.applyUrl || (job.entityUrn
      ? `https://www.linkedin.com/jobs/view/${job.entityUrn?.split(':').pop()}/`
      : ''),
    source: 'linkedin',
    posted_at: job.listedAt
      ? new Date(job.listedAt).toISOString().slice(0, 10)
      : null,
    description: job.description?.text || '',
  })).filter(j => j.title && j.url)
}
