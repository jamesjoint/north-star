import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import JobCard from '../../src/components/JobCard.jsx'

const JOB = {
  id: 'abc123',
  title: 'Product Manager',
  company: 'Acme',
  location: 'New York, NY',
  remote: 'hybrid',
  source: 'weworkremotely',
  score_aggregate: 7,
  score_dimensions: JSON.stringify({
    core_mechanism: { score: 8, reasoning: 'Influence-based role.' },
    summary: 'Strong fit overall.'
  }),
  seen: 0,
  url: 'https://x.com/1',
}

test('renders title, company, location', () => {
  render(<JobCard job={JOB} onSelect={vi.fn()} />)
  expect(screen.getByText('Product Manager')).toBeInTheDocument()
  expect(screen.getByText(/Acme/)).toBeInTheDocument()
  expect(screen.getByText(/New York, NY/)).toBeInTheDocument()
})

test('shows "New" badge when seen is 0', () => {
  render(<JobCard job={JOB} onSelect={vi.fn()} />)
  expect(screen.getByText('New')).toBeInTheDocument()
})

test('does not show "New" badge when seen is 1', () => {
  render(<JobCard job={{ ...JOB, seen: 1 }} onSelect={vi.fn()} />)
  expect(screen.queryByText('New')).not.toBeInTheDocument()
})

test('score badge shows aggregate score', () => {
  render(<JobCard job={JOB} onSelect={vi.fn()} />)
  expect(screen.getByText('7.0')).toBeInTheDocument()
})

test('calls onSelect with job id when clicked', () => {
  const onSelect = vi.fn()
  render(<JobCard job={JOB} onSelect={onSelect} />)
  fireEvent.click(screen.getByRole('article'))
  expect(onSelect).toHaveBeenCalledWith('abc123')
})

test('score badge shows dash when score is null', () => {
  render(<JobCard job={{ ...JOB, score_aggregate: null }} onSelect={vi.fn()} />)
  expect(screen.getByText('–')).toBeInTheDocument()
})
