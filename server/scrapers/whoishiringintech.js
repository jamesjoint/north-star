import { launch } from './browser.js'
import { detectRemote } from './utils.js'

const EMBED_URL = 'https://airtable.com/embed/app273MbfxysjvLIz/shrDiWjubnMeAEEVZ/tblfspa7OQUgZohgI'

// Functions we care about (PM, BD, partnerships-adjacent)
const RELEVANT_FUNCTIONS = ['Product', 'Business Development', 'BD', 'Sales', 'Marketing', 'Partnerships', 'Strategy', 'Operations', 'Customer Success', 'Growth', 'Data']

function isRelevant(functions) {
  if (!functions || functions.length === 0) return true // keep if unknown
  return functions.some(f => RELEVANT_FUNCTIONS.some(r => f.toLowerCase().includes(r.toLowerCase())))
}

function isUS(country) {
  if (!country) return true
  const c = country.toLowerCase()
  return c.includes('united states') || c.includes('us') || c === 'usa'
}

/**
 * Parse body innerText from Airtable grid.
 * Returns array of { name, url, functions, country, state, city, workEnv }
 */
function parseBodyText(text) {
  // Split into lines, clean up
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Find numbered company names: "1\nCompanyName\n2\nOther..."
  // They appear as sequences: digit line followed by company name
  const companies = []
  const companyNameSet = new Set()

  // Pattern: find all "N\nCompanyName" blocks in the numbered list section
  for (let i = 0; i < lines.length; i++) {
    if (/^\d+$/.test(lines[i]) && i + 1 < lines.length && lines[i + 1] && !/^\d+$/.test(lines[i + 1])) {
      const name = lines[i + 1]
      if (!companyNameSet.has(name) && !name.startsWith('http') && name.length > 0) {
        companyNameSet.add(name)
        companies.push(name)
      }
    }
  }

  // Find the data block — it comes after "Status" header
  const statusIdx = lines.findIndex(l => l === 'Status')
  if (statusIdx === -1) return companies.map(name => ({ name }))

  const dataLines = lines.slice(statusIdx + 1)

  // Parse data: each company row is: jobsURL, glassdoorURL, ...functions..., country, state, [city]
  // We detect jobs URL by starting with http and not containing glassdoor
  // Glassdoor URL contains glassdoor.com
  // Functions: known list of function words
  // Country: "United States", "Canada", "Australia", etc.
  // State: US state names / Canadian province
  const KNOWN_FUNCTIONS = ['Engineering', 'Product', 'Customer Success', 'Support', 'Data', 'Sales', 'Finance', 'Marketing', 'Design', 'HR', 'Internship', 'Business Development', 'BD', 'Operations', 'Partnerships', 'Growth', 'Legal', 'Strategy']
  const COUNTRIES = ['United States', 'Canada', 'Australia', 'France', 'Argentina', 'United Stated', 'United Kingdom', 'Germany', 'India', 'Singapore', 'Netherlands']
  const US_STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'Ontario', 'Quebec', 'British Columbia', 'Montreal', 'Toronto']
  const WORK_ENVS = ['Remote', 'Hybrid', 'On-site', 'In-person', 'Onsite', 'In Office', 'Flexible']

  function isUrlLike(line) {
    return line.startsWith('http') || line.startsWith('www.') || /^[a-z0-9-]+\.[a-z]{2,}\//.test(line)
  }

  function lineType(line) {
    if (isUrlLike(line) && !line.includes('glassdoor')) return 'jobsUrl'
    if (line.includes('glassdoor.com')) return 'glassdoor'
    if (KNOWN_FUNCTIONS.some(f => f.toLowerCase() === line.toLowerCase())) return 'function'
    if (COUNTRIES.some(c => c.toLowerCase() === line.toLowerCase())) return 'country'
    if (US_STATES.some(s => s.toLowerCase() === line.toLowerCase())) return 'state'
    if (WORK_ENVS.some(w => w.toLowerCase().includes(line.toLowerCase()) || line.toLowerCase().includes(w.toLowerCase()))) return 'workEnv'
    return 'unknown'
  }

  // Group dataLines into per-company blocks
  // Each block starts with a jobsUrl
  const blocks = []
  let current = null
  for (const line of dataLines) {
    const t = lineType(line)
    if (t === 'jobsUrl') {
      if (current) blocks.push(current)
      current = { jobsUrl: line, functions: [], country: null, state: null, city: null, workEnv: null }
    } else if (current) {
      if (t === 'function') current.functions.push(line)
      else if (t === 'country' && !current.country) current.country = line
      else if (t === 'state' && !current.state) current.state = line
      else if (t === 'workEnv' && !current.workEnv) current.workEnv = line
    }
  }
  if (current) blocks.push(current)

  // Zip company names with data blocks
  return companies.map((name, i) => {
    const b = blocks[i] || {}
    return {
      name,
      url: b.jobsUrl || null,
      functions: b.functions || [],
      country: b.country || null,
      state: b.state || null,
      workEnv: b.workEnv || null,
    }
  }).filter(c => c.url)
}

function normalizeUrl(url) {
  if (!url) return null
  url = url.trim()
  if (!url.startsWith('http')) url = 'https://' + url
  return url
}

export async function scrape() {
  const browser = await launch()
  const page = await browser.newPage()
  try {
    await page.goto(EMBED_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(5000)

    // Scroll through the virtualized grid in steps, collecting text at each position.
    // The .antiscroll-inner container is 3937px tall; we step by 400px to cover all 121 rows.
    const snapshots = []
    const scrollStep = 400
    const maxScroll = 4200

    for (let pos = 0; pos <= maxScroll; pos += scrollStep) {
      await page.evaluate((scrollTop) => {
        const el = document.querySelector('.antiscroll-inner')
        if (el) el.scrollTop = scrollTop
      }, pos)
      await page.waitForTimeout(500)
      snapshots.push(await page.evaluate(() => document.body.innerText))
    }

    // Parse each snapshot individually and merge by company name
    const byName = new Map()
    for (const text of snapshots) {
      const companies = parseBodyText(text)
      for (const c of companies) {
        if (c.name && !byName.has(c.name)) {
          byName.set(c.name, c)
        }
      }
    }

    const companies = [...byName.values()]
    console.log(`[whoishiringintech] Parsed ${companies.length} companies across ${snapshots.length} snapshots`)

    return companies
      .filter(c => isUS(c.country))
      .filter(c => isRelevant(c.functions))
      .map(c => {
        const location = [c.state].filter(Boolean).join(', ')
        const workEnvStr = (c.workEnv || '').toLowerCase()
        let remote = 'unknown'
        if (workEnvStr.includes('remote') && workEnvStr.includes('hybrid')) remote = 'hybrid'
        else if (workEnvStr.includes('remote')) remote = 'remote'
        else if (workEnvStr.includes('hybrid')) remote = 'hybrid'
        else if (workEnvStr.includes('on-site') || workEnvStr.includes('onsite') ||
                 workEnvStr.includes('in office') || workEnvStr.includes('in-person')) remote = 'onsite'

        const funcStr = c.functions.filter(f => isRelevant([f])).slice(0, 2).join(' / ')
        const title = funcStr ? `${funcStr} Roles` : 'Open Roles'

        return {
          title,
          company: c.name,
          location,
          remote,
          url: normalizeUrl(c.url),
          source: 'whoishiringintech',
          posted_at: new Date().toISOString().slice(0, 10),
          description: '',
        }
      })
      .filter(j => j.url)

  } finally {
    await page.close()
    await browser.close()
  }
}
