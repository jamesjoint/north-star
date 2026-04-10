import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

describe('Job description', () => {
  test('toggle button is shown when job has a description', () => {
    render(<JobDetail job={{ ...JOB, description: 'Lead product at Acme.' }} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /job description/i })).toBeInTheDocument()
  })

  test('description is hidden by default', () => {
    render(<JobDetail job={{ ...JOB, description: 'Lead product at Acme.' }} onClose={vi.fn()} />)
    expect(screen.queryByText('Lead product at Acme.')).not.toBeInTheDocument()
  })

  test('clicking toggle expands description', () => {
    render(<JobDetail job={{ ...JOB, description: 'Lead product at Acme.' }} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /job description/i }))
    expect(screen.getByText('Lead product at Acme.')).toBeInTheDocument()
  })

  test('clicking toggle again collapses description', () => {
    render(<JobDetail job={{ ...JOB, description: 'Lead product at Acme.' }} onClose={vi.fn()} />)
    const toggle = screen.getByRole('button', { name: /job description/i })
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(screen.queryByText('Lead product at Acme.')).not.toBeInTheDocument()
  })

  test('toggle not shown when description is absent', () => {
    render(<JobDetail job={{ ...JOB, description: null }} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /job description/i })).not.toBeInTheDocument()
  })
})

describe('Info pills', () => {
  test('renders salary_range when present', () => {
    render(<JobDetail job={{ ...JOB, salary_range: '$120k–$150k' }} onClose={vi.fn()} />)
    expect(screen.getByText('$120k–$150k')).toBeInTheDocument()
  })

  test('does not render salary pill when absent', () => {
    render(<JobDetail job={{ ...JOB, salary_range: null }} onClose={vi.fn()} />)
    expect(screen.queryByText(/\$\d+k/)).not.toBeInTheDocument()
  })

  test('renders follow_up_date when present', () => {
    render(<JobDetail job={{ ...JOB, follow_up_date: '2099-12-31' }} onClose={vi.fn()} />)
    expect(screen.getByText(/Follow up/)).toBeInTheDocument()
  })

  test('shows overdue styling when follow_up_date is in the past', () => {
    render(<JobDetail job={{ ...JOB, follow_up_date: '2020-01-01' }} onClose={vi.fn()} />)
    expect(screen.getByText(/Follow up overdue/)).toBeInTheDocument()
  })

  test('does not render follow_up pill when absent', () => {
    render(<JobDetail job={{ ...JOB, follow_up_date: null }} onClose={vi.fn()} />)
    expect(screen.queryByText(/Follow up/)).not.toBeInTheDocument()
  })
})

describe('Notes', () => {
  test('notes textarea visible when onStatusChange provided', () => {
    render(<JobDetail job={JOB} onClose={vi.fn()} onStatusChange={vi.fn()} />)
    expect(screen.getByPlaceholderText('Add notes…')).toBeInTheDocument()
  })

  test('notes textarea pre-filled with existing notes', () => {
    render(<JobDetail job={{ ...JOB, notes: 'Great culture fit.' }} onClose={vi.fn()} onStatusChange={vi.fn()} />)
    expect(screen.getByDisplayValue('Great culture fit.')).toBeInTheDocument()
  })

  test('notes textarea calls onStatusChange on blur', () => {
    const onStatusChange = vi.fn()
    render(<JobDetail job={JOB} onClose={vi.fn()} onStatusChange={onStatusChange} />)
    const textarea = screen.getByPlaceholderText('Add notes…')
    fireEvent.change(textarea, { target: { value: 'Recruiter was friendly.' } })
    fireEvent.blur(textarea)
    expect(onStatusChange).toHaveBeenCalledWith('abc123', { notes: 'Recruiter was friendly.' })
  })

  test('notes textarea not rendered when onStatusChange absent', () => {
    render(<JobDetail job={JOB} onClose={vi.fn()} />)
    expect(screen.queryByPlaceholderText('Add notes…')).not.toBeInTheDocument()
  })
})

describe('Salary + Follow-up editing', () => {
  test('salary input visible when onStatusChange provided', () => {
    render(<JobDetail job={JOB} onClose={vi.fn()} onStatusChange={vi.fn()} />)
    expect(screen.getByPlaceholderText('e.g. $120k–$150k')).toBeInTheDocument()
  })

  test('salary input pre-filled with existing value', () => {
    render(<JobDetail job={{ ...JOB, salary_range: '$120k–$150k' }} onClose={vi.fn()} onStatusChange={vi.fn()} />)
    expect(screen.getByDisplayValue('$120k–$150k')).toBeInTheDocument()
  })

  test('salary input calls onStatusChange on blur', () => {
    const onStatusChange = vi.fn()
    render(<JobDetail job={JOB} onClose={vi.fn()} onStatusChange={onStatusChange} />)
    const input = screen.getByPlaceholderText('e.g. $120k–$150k')
    fireEvent.change(input, { target: { value: '$100k' } })
    fireEvent.blur(input)
    expect(onStatusChange).toHaveBeenCalledWith('abc123', { salary_range: '$100k' })
  })

  test('follow-up date input visible when onStatusChange provided', () => {
    render(<JobDetail job={JOB} onClose={vi.fn()} onStatusChange={vi.fn()} />)
    expect(document.querySelector('input[type="date"]')).not.toBeNull()
  })

  test('follow-up date input pre-filled with existing value', () => {
    render(<JobDetail job={{ ...JOB, follow_up_date: '2099-12-31' }} onClose={vi.fn()} onStatusChange={vi.fn()} />)
    expect(screen.getByDisplayValue('2099-12-31')).toBeInTheDocument()
  })

  test('follow-up date calls onStatusChange on blur', () => {
    const onStatusChange = vi.fn()
    render(<JobDetail job={JOB} onClose={vi.fn()} onStatusChange={onStatusChange} />)
    const dateInput = document.querySelector('input[type="date"]')
    fireEvent.change(dateInput, { target: { value: '2099-06-01' } })
    fireEvent.blur(dateInput)
    expect(onStatusChange).toHaveBeenCalledWith('abc123', { follow_up_date: '2099-06-01' })
  })

  test('salary/follow-up section not rendered when onStatusChange absent', () => {
    render(<JobDetail job={JOB} onClose={vi.fn()} />)
    expect(screen.queryByPlaceholderText('e.g. $120k–$150k')).not.toBeInTheDocument()
  })
})

describe('Quick track', () => {
  test('not rendered when onStatusChange is not provided', () => {
    render(<JobDetail job={JOB} onClose={vi.fn()} />)
    expect(screen.queryByText('Applied')).not.toBeInTheDocument()
  })

  test('renders all status pills when onStatusChange is provided', () => {
    render(<JobDetail job={JOB} onClose={vi.fn()} onStatusChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Applied' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Interviewing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
  })

  test('clicking a status pill calls onStatusChange with that status', () => {
    const onStatusChange = vi.fn()
    render(<JobDetail job={JOB} onClose={vi.fn()} onStatusChange={onStatusChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Applied' }))
    expect(onStatusChange).toHaveBeenCalledWith('abc123', { status: 'Applied' })
  })

  test('clicking the active status pill deselects it (sends "none")', () => {
    const onStatusChange = vi.fn()
    render(<JobDetail job={{ ...JOB, status: 'Applied' }} onClose={vi.fn()} onStatusChange={onStatusChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Applied' }))
    expect(onStatusChange).toHaveBeenCalledWith('abc123', { status: 'none' })
  })
})

describe('keyboard navigation', () => {
  test('ArrowRight calls onNext', () => {
    const onNext = vi.fn()
    render(<JobDetail job={JOB} onClose={vi.fn()} onNext={onNext} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onNext).toHaveBeenCalled()
  })

  test('ArrowLeft calls onPrev', () => {
    const onPrev = vi.fn()
    render(<JobDetail job={JOB} onClose={vi.fn()} onPrev={onPrev} />)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(onPrev).toHaveBeenCalled()
  })

  test('Escape calls onClose', () => {
    const onClose = vi.fn()
    render(<JobDetail job={JOB} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  test('ArrowRight does not trigger when focused in an input', () => {
    const onNext = vi.fn()
    render(<JobDetail job={JOB} onClose={vi.fn()} onNext={onNext} onStatusChange={vi.fn()} />)
    const input = screen.getByPlaceholderText('e.g. $120k–$150k')
    fireEvent.keyDown(input, { key: 'ArrowRight', target: input })
    expect(onNext).not.toHaveBeenCalled()
  })

  test('ArrowRight does not call onNext when onNext is null', () => {
    const onClose = vi.fn()
    render(<JobDetail job={JOB} onClose={onClose} onNext={null} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    // No error thrown and onClose was not called
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('JobDetail — nav bar close button', () => {
  test('‹ Back button calls onClose', () => {
    const onClose = vi.fn()
    render(<JobDetail job={JOB} onClose={onClose} />)
    fireEvent.click(screen.getByText(/‹/))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('JobDetail — score badge', () => {
  test('shows score percentage badge when score is present', () => {
    // score_aggregate: 7.5 → scorePct = Math.round(7.5 * 10) = 75
    render(<JobDetail job={JOB} onClose={vi.fn()} />)
    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  test('does not show score badge when score is null', () => {
    render(<JobDetail job={{ ...JOB, score_aggregate: null }} onClose={vi.fn()} />)
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
  })
})

describe('JobDetail — pipeline label', () => {
  test('shows pipeline label and next step for Applied status', () => {
    render(<JobDetail job={{ ...JOB, status: 'Applied' }} onClose={vi.fn()} />)
    // pipe.label = 'Applied', pipe.next = 'Phone Screen'
    expect(screen.getByText('Applied')).toBeInTheDocument()
    expect(screen.getByText('Phone Screen')).toBeInTheDocument()
  })

  test('shows "Applied {ago}" when applied_date is set', () => {
    render(<JobDetail job={{ ...JOB, applied_date: '2026-01-01' }} onClose={vi.fn()} />)
    // Pipeline sub-label shows "Applied <relative date>"
    expect(screen.getByText(/^Applied /)).toBeInTheDocument()
  })
})

describe('JobDetail — local draft state reset on navigation', () => {
  test('notes draft resets when navigating to a different job', () => {
    const onStatusChange = vi.fn()
    const { rerender } = render(<JobDetail job={JOB} onClose={vi.fn()} onStatusChange={onStatusChange} />)
    const textarea = screen.getByPlaceholderText('Add notes…')
    fireEvent.change(textarea, { target: { value: 'Draft notes' } })
    expect(screen.getByDisplayValue('Draft notes')).toBeInTheDocument()
    // Navigate to a different job (different id)
    rerender(<JobDetail job={{ ...JOB, id: 'xyz999', title: 'Other Job' }} onClose={vi.fn()} onStatusChange={onStatusChange} />)
    expect(screen.queryByDisplayValue('Draft notes')).not.toBeInTheDocument()
  })

  test('salary draft resets when navigating to a different job', () => {
    const onStatusChange = vi.fn()
    const { rerender } = render(<JobDetail job={JOB} onClose={vi.fn()} onStatusChange={onStatusChange} />)
    const salaryInput = screen.getByPlaceholderText('e.g. $120k–$150k')
    fireEvent.change(salaryInput, { target: { value: '$200k' } })
    expect(screen.getByDisplayValue('$200k')).toBeInTheDocument()
    rerender(<JobDetail job={{ ...JOB, id: 'xyz999', title: 'Other Job' }} onClose={vi.fn()} onStatusChange={onStatusChange} />)
    expect(screen.queryByDisplayValue('$200k')).not.toBeInTheDocument()
  })

  test('follow-up draft resets when navigating to a different job', () => {
    const onStatusChange = vi.fn()
    const { rerender } = render(<JobDetail job={JOB} onClose={vi.fn()} onStatusChange={onStatusChange} />)
    const dateInput = document.querySelector('input[type="date"]')
    fireEvent.change(dateInput, { target: { value: '2099-06-01' } })
    expect(screen.getByDisplayValue('2099-06-01')).toBeInTheDocument()
    rerender(<JobDetail job={{ ...JOB, id: 'xyz999', title: 'Other Job' }} onClose={vi.fn()} onStatusChange={onStatusChange} />)
    expect(screen.queryByDisplayValue('2099-06-01')).not.toBeInTheDocument()
  })
})
