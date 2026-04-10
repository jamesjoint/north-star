import { describe, it, expect, vi, afterEach } from 'vitest'
import { jobsToCsv, downloadCsv } from '../../src/utils/export.js'

const job = (overrides = {}) => ({
  title: 'Product Manager',
  company: 'Acme',
  location: 'New York, NY',
  status: 'Applied',
  score_aggregate: 7.5,
  applied_date: '2026-03-15',
  follow_up_date: null,
  notes: null,
  url: 'https://example.com/job/1',
  source: 'linkedin',
  ...overrides,
})

describe('jobsToCsv', () => {
  it('produces a header row with all columns', () => {
    const csv = jobsToCsv([])
    expect(csv).toContain('Title,Company,Location,Status,Score,Salary Range,Applied Date,Follow-up Date,Notes,URL,Source')
  })

  it('includes salary_range in the output', () => {
    const csv = jobsToCsv([job({ salary_range: '$120k–$150k', location: 'Remote' })])
    const dataLine = csv.split('\n')[1]
    const cols = dataLine.split(',')
    expect(cols[5]).toBe('$120k\u2013$150k') // col 5 = Salary Range
  })

  it('produces one data row per job', () => {
    const csv = jobsToCsv([job(), job({ title: 'Engineer' })])
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(3) // header + 2 data rows
  })

  it('formats score to 1 decimal place', () => {
    const csv = jobsToCsv([job({ score_aggregate: 8.333 })])
    expect(csv).toContain('8.3')
  })

  it('leaves score empty when null', () => {
    // Use a job with no commas in location/salary to simplify parsing
    const csv = jobsToCsv([job({ score_aggregate: null, location: 'Remote' })])
    const dataLine = csv.split('\n')[1]
    const cols = dataLine.split(',')
    // col 0=title,1=company,2=location,3=status,4=score,5=salary,6=applied,7=followup,8=notes,9=url,10=source
    expect(cols[4]).toBe('')
  })

  it('wraps values with commas in double-quotes', () => {
    const csv = jobsToCsv([job({ location: 'New York, NY' })])
    expect(csv).toContain('"New York, NY"')
  })

  it('escapes double-quotes in values', () => {
    const csv = jobsToCsv([job({ notes: 'She said "great role"' })])
    expect(csv).toContain('"She said ""great role"""')
  })

  it('leaves null/undefined fields as empty strings', () => {
    const csv = jobsToCsv([job({ salary_range: null, follow_up_date: null, notes: undefined, location: 'Remote' })])
    const dataLine = csv.split('\n')[1]
    const cols = dataLine.split(',')
    // col 0=title,1=company,2=location,3=status,4=score,5=salary,6=applied,7=followup,8=notes,9=url,10=source
    expect(cols[5]).toBe('') // salary_range
    expect(cols[7]).toBe('') // follow_up_date
    expect(cols[8]).toBe('') // notes
  })

  it('handles multiline notes with quoting', () => {
    const csv = jobsToCsv([job({ notes: 'Line 1\nLine 2' })])
    expect(csv).toContain('"Line 1\nLine 2"')
  })

  it('returns only header for empty job list', () => {
    const csv = jobsToCsv([])
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(1)
  })

  it('formats integer score with one decimal place (7 → "7.0")', () => {
    const csv = jobsToCsv([job({ score_aggregate: 7, location: 'Remote' })])
    const dataLine = csv.split('\n')[1]
    const cols = dataLine.split(',')
    expect(cols[4]).toBe('7.0')
  })

  it('applies quoting to values with newlines in description field', () => {
    const csv = jobsToCsv([job({ title: 'PM\nLead', location: 'Remote' })])
    expect(csv).toContain('"PM\nLead"')
  })
})

describe('downloadCsv', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls URL.createObjectURL with a Blob and then revokes it', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const mockClick = vi.fn()
    const mockAnchor = { href: '', download: '', click: mockClick }
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)

    downloadCsv('col1,col2\nval1,val2', 'output.csv')

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(mockAnchor.download).toBe('output.csv')
    expect(mockClick).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('uses "tracker.csv" as default filename', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const mockAnchor = { href: '', download: '', click: vi.fn() }
    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor)

    downloadCsv('data')

    expect(mockAnchor.download).toBe('tracker.csv')
  })
})
