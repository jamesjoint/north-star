import { test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FilterBar from '../../src/components/FilterBar.jsx'

const SOURCES = ['weworkremotely', 'linkedin', 'nyfa']
const FILTERS = { sources: [], remote: 'all', minScore: 0 }

test('renders source checkboxes', () => {
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={vi.fn()} />)
  expect(screen.getByLabelText('weworkremotely')).toBeInTheDocument()
  expect(screen.getByLabelText('linkedin')).toBeInTheDocument()
})

test('calls onChange with updated sources when checkbox toggled', () => {
  const onChange = vi.fn()
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={onChange} />)
  fireEvent.click(screen.getByLabelText('linkedin'))
  expect(onChange).toHaveBeenCalledWith({ ...FILTERS, sources: ['linkedin'] })
})

test('calls onChange when remote filter changes', () => {
  const onChange = vi.fn()
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={onChange} />)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'remote' } })
  expect(onChange).toHaveBeenCalledWith({ ...FILTERS, remote: 'remote' })
})

test('calls onChange when min score slider moves', () => {
  const onChange = vi.fn()
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={onChange} />)
  fireEvent.change(screen.getByRole('slider'), { target: { value: '6' } })
  expect(onChange).toHaveBeenCalledWith({ ...FILTERS, minScore: 6 })
})
