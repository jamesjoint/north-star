import { detectRemote } from './utils.js'

// Action name — verify in your Composio dashboard under LinkedIn actions
// Likely: LINKEDIN_SEARCH_JOB_POSTINGS or LINKEDIN_GET_JOB_RECOMMENDATIONS
const LINKEDIN_ACTION = 'LINKEDIN_SEARCH_JOB_POSTINGS'

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

  let result
  try {
    result = await toolset.executeAction(LINKEDIN_ACTION, {
      keywords: 'product manager OR partnerships manager OR head of product OR business development',
      location: 'New York, NY',
      count: 50,
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
