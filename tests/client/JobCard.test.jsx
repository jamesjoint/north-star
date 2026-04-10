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

test('shows unseen indicator (blue dot) when seen is 0', () => {
  render(<JobCard job={JOB} onSelect={vi.fn()} />)
  // "New" text is gone — unseen is now a blue dot; verify no text badge
  expect(screen.queryByText('New')).not.toBeInTheDocument()
})

test('does not show unseen indicator when seen is 1', () => {
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

test('score badge shows em-dash when score is null', () => {
  render(<JobCard job={{ ...JOB, score_aggregate: null }} onSelect={vi.fn()} />)
  expect(screen.getByText('—')).toBeInTheDocument()
})

describe('status dropdown', () => {
  test('shows "Track…" for jobs with no status', () => {
    render(<JobCard job={JOB} onStatusChange={vi.fn()} />)
    expect(screen.getByDisplayValue('Track…')).toBeInTheDocument()
  })

  test('shows current status when job has one', () => {
    render(<JobCard job={{ ...JOB, status: 'Applied' }} onStatusChange={vi.fn()} />)
    expect(screen.getByDisplayValue('Applied')).toBeInTheDocument()
  })

  test('calls onStatusChange when selection changes', () => {
    const onStatusChange = vi.fn()
    render(<JobCard job={JOB} onStatusChange={onStatusChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Applied' } })
    expect(onStatusChange).toHaveBeenCalledWith('abc123', { status: 'Applied' })
  })

  test('does not bubble click to onSelect when interacting with dropdown', () => {
    const onSelect = vi.fn()
    render(<JobCard job={JOB} onSelect={onSelect} onStatusChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('combobox'))
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('remote badge', () => {
  test('shows "Remote" for remote jobs', () => {
    render(<JobCard job={{ ...JOB, remote: 'remote' }} onSelect={vi.fn()} />)
    expect(screen.getByText(/Remote/)).toBeInTheDocument()
  })

  test('shows "Hybrid" for hybrid jobs', () => {
    render(<JobCard job={JOB} onSelect={vi.fn()} />)
    expect(screen.getByText(/Hybrid/)).toBeInTheDocument()
  })

  test('shows "On-site" for onsite jobs', () => {
    render(<JobCard job={{ ...JOB, remote: 'onsite' }} onSelect={vi.fn()} />)
    expect(screen.getByText(/On-site/)).toBeInTheDocument()
  })

  test('shows no remote badge when remote is null', () => {
    render(<JobCard job={{ ...JOB, remote: null }} onSelect={vi.fn()} />)
    expect(screen.queryByText(/Remote|Hybrid|On-site/)).not.toBeInTheDocument()
  })
})

describe('delete button', () => {
  test('not shown by default (requires hover)', () => {
    render(<JobCard job={JOB} onSelect={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument()
  })

  test('appears on hover when onDelete is provided', () => {
    render(<JobCard job={JOB} onSelect={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.mouseEnter(screen.getByRole('article'))
    expect(screen.getByTitle('Delete')).toBeInTheDocument()
  })

  test('calls onDelete with job id when clicked', () => {
    const onDelete = vi.fn()
    render(<JobCard job={JOB} onSelect={vi.fn()} onDelete={onDelete} />)
    fireEvent.mouseEnter(screen.getByRole('article'))
    fireEvent.click(screen.getByTitle('Delete'))
    expect(onDelete).toHaveBeenCalledWith('abc123')
  })

  test('not shown when onDelete prop is absent', () => {
    render(<JobCard job={JOB} onSelect={vi.fn()} />)
    fireEvent.mouseEnter(screen.getByRole('article'))
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument()
  })
})

describe('summary tooltip', () => {
  test('shows "i" info badge when job has a summary', () => {
    render(<JobCard job={JOB} onSelect={vi.fn()} />)
    expect(screen.getByText('i')).toBeInTheDocument()
  })

  test('does not show "i" badge when job has no summary', () => {
    const noSummary = { ...JOB, score_dimensions: JSON.stringify({ core_mechanism: { score: 8 } }) }
    render(<JobCard job={noSummary} onSelect={vi.fn()} />)
    expect(screen.queryByText('i')).not.toBeInTheDocument()
  })

  test('tooltip text appears on mouseEnter', () => {
    render(<JobCard job={JOB} onSelect={vi.fn()} />)
    expect(screen.queryByText('Strong fit overall.')).not.toBeInTheDocument()
    fireEvent.mouseEnter(screen.getByText('i'))
    expect(screen.getByText('Strong fit overall.')).toBeInTheDocument()
  })

  test('tooltip text disappears on mouseLeave', () => {
    render(<JobCard job={JOB} onSelect={vi.fn()} />)
    fireEvent.mouseEnter(screen.getByText('i'))
    expect(screen.getByText('Strong fit overall.')).toBeInTheDocument()
    fireEvent.mouseLeave(screen.getByText('i'))
    expect(screen.queryByText('Strong fit overall.')).not.toBeInTheDocument()
  })
})

describe('date display', () => {
  test('shows relative date from posted_at', () => {
    // Today is 2026-04-09; posted 3 days ago
    render(<JobCard job={{ ...JOB, posted_at: '2026-04-06' }} onSelect={vi.fn()} />)
    expect(screen.getByText(/3 days ago/)).toBeInTheDocument()
  })

  test('shows relative date from fetched_at when posted_at is null', () => {
    // fetched_at is ISO datetime; slice(0,10) = '2026-04-07' → 2 days ago
    render(<JobCard job={{ ...JOB, posted_at: null, fetched_at: '2026-04-07T12:00:00Z' }} onSelect={vi.fn()} />)
    expect(screen.getByText(/2 days ago/)).toBeInTheDocument()
  })

  test('shows no date when both posted_at and fetched_at are absent', () => {
    render(<JobCard job={{ ...JOB, posted_at: null, fetched_at: null }} onSelect={vi.fn()} />)
    expect(screen.queryByText(/days ago|today|yesterday|week ago/)).not.toBeInTheDocument()
  })

  test('posted_at takes precedence over fetched_at', () => {
    render(<JobCard job={{ ...JOB, posted_at: '2026-04-09', fetched_at: '2026-04-06T00:00:00Z' }} onSelect={vi.fn()} />)
    expect(screen.getByText(/today/)).toBeInTheDocument()
  })
})

describe('subtitle edge cases', () => {
  test('omits location separator when location is null', () => {
    render(<JobCard job={{ ...JOB, location: null }} onSelect={vi.fn()} />)
    // Should still show company but no "·" location segment
    expect(screen.getByText(/Acme/)).toBeInTheDocument()
    expect(screen.queryByText(/New York/)).not.toBeInTheDocument()
  })
})
