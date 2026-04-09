import { test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import JobDetail from '../../src/components/JobDetail.jsx'

const JOB = {
  id: 'abc123',
  title: 'Product Manager',
  company: 'Acme',
  location: 'New York, NY',
  remote: 'hybrid',
  source: 'weworkremotely',
  url: 'https://example.com/job/1',
  score_aggregate: 7.5,
  score_dimensions: JSON.stringify({
    core_mechanism: { score: 8, reasoning: 'Influence-based role.' },
    product_depth: { score: 7, reasoning: 'Owns product.' },
    regulated_complexity: { score: 9, reasoning: 'Fintech.' },
    bd_track_record: { score: 6, reasoning: 'BD mentioned.' },
    mba_preference: { score: 5, reasoning: 'Preferred.' },
    domain_gap: { score: 4, reasoning: 'No crypto.' },
    gap_bridgeability: { score: 7, reasoning: 'Learnable.' },
    summary: 'Strong fit overall.',
  }),
  posted_at: '2026-03-28',
}

test('renders job title and company', () => {
  render(<JobDetail job={JOB} onClose={vi.fn()} />)
  expect(screen.getByText('Product Manager')).toBeInTheDocument()
  expect(screen.getByText(/Acme/)).toBeInTheDocument()
})

test('renders all 7 dimension friendly labels', () => {
  render(<JobDetail job={JOB} onClose={vi.fn()} />)
  expect(screen.getByText('Connector Fit')).toBeInTheDocument()
  expect(screen.getByText('Daily Texture')).toBeInTheDocument()
  expect(screen.getByText('Structural Integrity')).toBeInTheDocument()
  expect(screen.getByText('Visibility')).toBeInTheDocument()
  expect(screen.getByText('Pioneering')).toBeInTheDocument()
  expect(screen.getByText('Domain Fit')).toBeInTheDocument()
  expect(screen.getByText('Gap Bridgeability')).toBeInTheDocument()
})

test('renders dimension score numbers', () => {
  render(<JobDetail job={JOB} onClose={vi.fn()} />)
  expect(screen.getByText('8')).toBeInTheDocument()
})

test('renders link to original listing', () => {
  render(<JobDetail job={JOB} onClose={vi.fn()} />)
  const link = screen.getByTitle('View listing')
  expect(link).toHaveAttribute('href', 'https://example.com/job/1')
})

test('renders AI summary in quotes', () => {
  render(<JobDetail job={JOB} onClose={vi.fn()} />)
  expect(screen.getByText('"Strong fit overall."')).toBeInTheDocument()
})
