import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FilterBar from '../../src/components/FilterBar.jsx'

const SOURCES = ['weworkremotely', 'linkedin', 'nyfa']
const FILTERS = {
  sources: [], remote: 'all', minScore: 0, showExpired: false,
  sort: 'score_desc', statusFilter: 'all', location: '', query: '', hideNoJD: false,
}

test('renders remote filter with default All locations', () => {
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={vi.fn()} />)
  expect(screen.getByDisplayValue('All locations')).toBeInTheDocument()
})

test('calls onChange when remote filter changes', () => {
  const onChange = vi.fn()
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={onChange} />)
  fireEvent.change(screen.getByDisplayValue('All locations'), { target: { value: 'remote' } })
  expect(onChange).toHaveBeenCalledWith({ ...FILTERS, remote: 'remote' })
})

test('calls onChange when min score slider moves', () => {
  const onChange = vi.fn()
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={onChange} />)
  fireEvent.change(screen.getByRole('slider'), { target: { value: '6' } })
  expect(onChange).toHaveBeenCalledWith({ ...FILTERS, minScore: 6 })
})

test('calls onChange when sort select changes', () => {
  const onChange = vi.fn()
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={onChange} />)
  fireEvent.change(screen.getByDisplayValue('Score ↓'), { target: { value: 'newest' } })
  expect(onChange).toHaveBeenCalledWith({ ...FILTERS, sort: 'newest' })
})

test('calls onChange when status filter changes', () => {
  const onChange = vi.fn()
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={onChange} />)
  fireEvent.change(screen.getByDisplayValue('All'), { target: { value: 'Applied' } })
  expect(onChange).toHaveBeenCalledWith({ ...FILTERS, statusFilter: 'Applied' })
})

test('calls onChange when title/company search input changes', () => {
  const onChange = vi.fn()
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={onChange} />)
  fireEvent.change(screen.getByPlaceholderText('Title or company…'), { target: { value: 'Acme' } })
  expect(onChange).toHaveBeenCalledWith({ ...FILTERS, query: 'Acme' })
})

test('calls onChange when location input changes', () => {
  const onChange = vi.fn()
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={onChange} />)
  fireEvent.change(screen.getByPlaceholderText('Location…'), { target: { value: 'New York' } })
  expect(onChange).toHaveBeenCalledWith({ ...FILTERS, location: 'New York' })
})

test('calls onChange when showExpired checkbox changes', () => {
  const onChange = vi.fn()
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={onChange} />)
  fireEvent.click(screen.getByLabelText('Expired'))
  expect(onChange).toHaveBeenCalledWith({ ...FILTERS, showExpired: true })
})

test('calls onChange when hideNoJD checkbox changes', () => {
  const onChange = vi.fn()
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={onChange} />)
  fireEvent.click(screen.getByLabelText('Has JD'))
  expect(onChange).toHaveBeenCalledWith({ ...FILTERS, hideNoJD: true })
})

describe('source chips', () => {
  test('toggling a source chip adds it to sources', () => {
    const onChange = vi.fn()
    render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={onChange} />)
    fireEvent.click(screen.getByText('linkedin'))
    expect(onChange).toHaveBeenCalledWith({ ...FILTERS, sources: ['linkedin'] })
  })

  test('toggling an active chip removes it', () => {
    const onChange = vi.fn()
    const active = { ...FILTERS, sources: ['linkedin'] }
    render(<FilterBar sources={SOURCES} filters={active} onChange={onChange} />)
    fireEvent.click(screen.getByText('linkedin'))
    expect(onChange).toHaveBeenCalledWith({ ...active, sources: [] })
  })

  test('clear button removes all sources', () => {
    const onChange = vi.fn()
    render(<FilterBar sources={SOURCES} filters={{ ...FILTERS, sources: ['linkedin'] }} onChange={onChange} />)
    fireEvent.click(screen.getByText('clear'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sources: [] }))
  })

  test('source count badge is shown when sourceCounts has a value', () => {
    render(<FilterBar sources={SOURCES} sourceCounts={{ linkedin: 42 }} filters={FILTERS} onChange={vi.fn()} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  test('source chips are not shown when there is only 1 source', () => {
    render(<FilterBar sources={['weworkremotely']} filters={FILTERS} onChange={vi.fn()} />)
    expect(screen.queryByText('weworkremotely')).not.toBeInTheDocument()
  })
})

describe('reset button', () => {
  test('is hidden when filters are default', () => {
    render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={vi.fn()} />)
    expect(screen.queryByText('reset')).not.toBeInTheDocument()
  })

  test('appears when filters are non-default', () => {
    render(<FilterBar sources={SOURCES} filters={{ ...FILTERS, minScore: 5 }} onChange={vi.fn()} />)
    expect(screen.getByText('reset')).toBeInTheDocument()
  })

  test('clicking reset calls onChange with defaults', () => {
    const onChange = vi.fn()
    render(<FilterBar sources={SOURCES} filters={{ ...FILTERS, minScore: 5 }} onChange={onChange} />)
    fireEvent.click(screen.getByText('reset'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ minScore: 0, remote: 'all', sort: 'score_desc' }))
  })
})
