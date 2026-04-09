import { test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FilterBar from '../../src/components/FilterBar.jsx'

const SOURCES = ['weworkremotely', 'linkedin', 'nyfa']
const FILTERS = { sources: [], remote: 'all', minScore: 0 }

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
