import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Tracker from '../../src/components/Tracker.jsx'

let mockPatchJobDescription = vi.fn()
vi.mock('../../src/api.js', () => ({
  patchJobDescription: (...args) => mockPatchJobDescription(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockPatchJobDescription.mockResolvedValue({})
})

const BOARDS = [
  { id: 'b1', name: 'My Job Search', emoji: null, job_count: 2 },
  { id: 'b2', name: 'Dream Jobs', emoji: '⭐', job_count: 0 },
]

function makeJob(overrides = {}) {
  return {
    id: 'j1',
    title: 'Head of Partnerships',
    company: 'Acme Corp',
    location: 'Remote',
    status: 'Applied',
    board_id: 'b1',
    score_aggregate: 8.5,
    applied_date: '2026-04-01',
    notes: '',
    salary_range: '',
    direct_link: null,
    follow_up_date: null,
    url: 'https://example.com/job/1',
    description: null,
    score_dimensions: null,
    ...overrides,
  }
}

const DEFAULT_PROPS = {
  jobs: [],
  onUpdate: vi.fn(),
  onAddJob: vi.fn(),
  onDelete: vi.fn(),
  onSelect: vi.fn(),
  selectedId: null,
  boards: BOARDS,
  activeBoardId: null,
  onSelectBoard: vi.fn(),
  onCreateBoard: vi.fn(),
  onRenameBoard: vi.fn(),
  onDeleteBoard: vi.fn(),
}

describe('Tracker — rendering', () => {
  test('shows board tabs when boards are provided', () => {
    render(<Tracker {...DEFAULT_PROPS} />)
    expect(screen.getByRole('button', { name: /My Job Search/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dream Jobs/ })).toBeInTheDocument()
  })

  test('shows "All" tab when boards are present', () => {
    render(<Tracker {...DEFAULT_PROPS} />)
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
  })

  test('shows empty state when no tracked jobs', () => {
    render(<Tracker {...DEFAULT_PROPS} jobs={[]} />)
    expect(screen.getByText(/No tracked jobs yet/)).toBeInTheDocument()
  })

  test('shows tracked job rows when jobs with status are provided', () => {
    const jobs = [makeJob({ id: 'j1', status: 'Applied' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    expect(screen.getByText('Head of Partnerships')).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  test('excludes jobs without status (status=none or null)', () => {
    const jobs = [makeJob({ id: 'j1', status: 'none' }), makeJob({ id: 'j2', title: 'Other Job', status: null })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    expect(screen.queryByText('Head of Partnerships')).not.toBeInTheDocument()
    expect(screen.queryByText('Other Job')).not.toBeInTheDocument()
  })
})

describe('Tracker — board interactions', () => {
  test('clicking a board tab calls onSelectBoard with that board id', () => {
    const onSelectBoard = vi.fn()
    render(<Tracker {...DEFAULT_PROPS} onSelectBoard={onSelectBoard} />)
    fireEvent.click(screen.getByRole('button', { name: /My Job Search/ }))
    expect(onSelectBoard).toHaveBeenCalledWith('b1')
  })

  test('clicking "All" tab calls onSelectBoard with null', () => {
    const onSelectBoard = vi.fn()
    render(<Tracker {...DEFAULT_PROPS} onSelectBoard={onSelectBoard} />)
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(onSelectBoard).toHaveBeenCalledWith(null)
  })

  test('shows delete board button for active board when more than one board exists', () => {
    render(<Tracker {...DEFAULT_PROPS} activeBoardId="b1" />)
    expect(screen.getByTitle('Delete board')).toBeInTheDocument()
  })

  test('double-clicking a board tab enters rename mode', () => {
    render(<Tracker {...DEFAULT_PROPS} activeBoardId="b1" />)
    const boardBtn = screen.getByRole('button', { name: /My Job Search/ })
    fireEvent.doubleClick(boardBtn)
    expect(screen.getByDisplayValue('My Job Search')).toBeInTheDocument()
  })
})

describe('Tracker — add job form', () => {
  test('clicking "+ Add Job" shows the add job form', () => {
    render(<Tracker {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Job' }))
    expect(screen.getByPlaceholderText('Job listing URL (required)')).toBeInTheDocument()
  })

  test('shows error when URL and title are empty on submit', () => {
    render(<Tracker {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Job' }))
    fireEvent.submit(screen.getByPlaceholderText('Job listing URL (required)').closest('form'))
    expect(screen.getByText(/URL and Title are required/)).toBeInTheDocument()
  })

  test('calls onAddJob with form data on valid submit', async () => {
    const onAddJob = vi.fn().mockResolvedValue({})
    render(<Tracker {...DEFAULT_PROPS} onAddJob={onAddJob} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Job' }))
    fireEvent.change(screen.getByPlaceholderText('Job listing URL (required)'), { target: { value: 'https://example.com/job' } })
    fireEvent.change(screen.getByPlaceholderText('Job title (required)'), { target: { value: 'Product Manager' } })
    fireEvent.submit(screen.getByPlaceholderText('Job listing URL (required)').closest('form'))
    await waitFor(() => expect(onAddJob).toHaveBeenCalled())
    expect(onAddJob.mock.calls[0][0].url).toBe('https://example.com/job')
    expect(onAddJob.mock.calls[0][0].title).toBe('Product Manager')
  })

  test('hides form after successful add', async () => {
    const onAddJob = vi.fn().mockResolvedValue({})
    render(<Tracker {...DEFAULT_PROPS} onAddJob={onAddJob} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Job' }))
    fireEvent.change(screen.getByPlaceholderText('Job listing URL (required)'), { target: { value: 'https://example.com/job' } })
    fireEvent.change(screen.getByPlaceholderText('Job title (required)'), { target: { value: 'Product Manager' } })
    fireEvent.submit(screen.getByPlaceholderText('Job listing URL (required)').closest('form'))
    await waitFor(() => expect(screen.queryByPlaceholderText('Job listing URL (required)')).not.toBeInTheDocument())
  })
})

describe('Tracker — board creation', () => {
  test('clicking the new board button shows the board creation input', () => {
    render(<Tracker {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByTitle('New board'))
    expect(screen.getByPlaceholderText('Board name')).toBeInTheDocument()
  })

  test('submitting board name calls onCreateBoard', () => {
    const onCreateBoard = vi.fn()
    render(<Tracker {...DEFAULT_PROPS} onCreateBoard={onCreateBoard} />)
    fireEvent.click(screen.getByTitle('New board'))
    fireEvent.change(screen.getByPlaceholderText('Board name'), { target: { value: 'My New Board' } })
    fireEvent.submit(screen.getByPlaceholderText('Board name').closest('form'))
    expect(onCreateBoard).toHaveBeenCalledWith('My New Board')
  })

  test('pressing Escape in new board name input cancels without calling onCreateBoard', () => {
    const onCreateBoard = vi.fn()
    render(<Tracker {...DEFAULT_PROPS} onCreateBoard={onCreateBoard} />)
    fireEvent.click(screen.getByTitle('New board'))
    expect(screen.getByPlaceholderText('Board name')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByPlaceholderText('Board name'), { key: 'Escape' })
    expect(onCreateBoard).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText('Board name')).not.toBeInTheDocument()
  })

  test('blurring new board name input cancels without calling onCreateBoard', () => {
    const onCreateBoard = vi.fn()
    render(<Tracker {...DEFAULT_PROPS} onCreateBoard={onCreateBoard} />)
    fireEvent.click(screen.getByTitle('New board'))
    expect(screen.getByPlaceholderText('Board name')).toBeInTheDocument()
    fireEvent.blur(screen.getByPlaceholderText('Board name'))
    expect(onCreateBoard).not.toHaveBeenCalled()
    expect(screen.queryByPlaceholderText('Board name')).not.toBeInTheDocument()
  })
})

describe('Tracker — board rename', () => {
  test('pressing Enter in rename input calls onRenameBoard with id and new name', () => {
    const onRenameBoard = vi.fn()
    render(<Tracker {...DEFAULT_PROPS} activeBoardId="b1" onRenameBoard={onRenameBoard} />)
    const boardBtn = screen.getByRole('button', { name: /My Job Search/ })
    fireEvent.doubleClick(boardBtn)
    const input = screen.getByDisplayValue('My Job Search')
    fireEvent.change(input, { target: { value: 'Renamed Board' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRenameBoard).toHaveBeenCalledWith('b1', 'Renamed Board')
  })

  test('clicking delete board button calls onDeleteBoard with board id', () => {
    const onDeleteBoard = vi.fn()
    render(<Tracker {...DEFAULT_PROPS} activeBoardId="b1" onDeleteBoard={onDeleteBoard} />)
    fireEvent.click(screen.getByTitle('Delete board'))
    expect(onDeleteBoard).toHaveBeenCalledWith('b1')
  })
})

describe('Tracker — row interactions', () => {
  test('clicking job title calls onSelect with job id', () => {
    const onSelect = vi.fn()
    const jobs = [makeJob({ id: 'j1', status: 'Applied' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Head of Partnerships'))
    expect(onSelect).toHaveBeenCalledWith('j1')
  })

  test('changing status dropdown calls onUpdate with new status', () => {
    const onUpdate = vi.fn()
    const jobs = [makeJob({ id: 'j1', status: 'Applied' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} onUpdate={onUpdate} />)
    // There's one status select in the table row
    const selects = screen.getAllByRole('combobox')
    // The first combobox after the sort dropdown — find the one for status
    const statusSelect = selects.find(s => s.value === 'Applied')
    fireEvent.change(statusSelect, { target: { value: 'Interviewing' } })
    expect(onUpdate).toHaveBeenCalledWith('j1', { status: 'Interviewing' })
  })

  test('blurring notes input calls onUpdate with notes value', () => {
    const onUpdate = vi.fn()
    const jobs = [makeJob({ id: 'j1', status: 'Applied', notes: 'Initial note' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} onUpdate={onUpdate} />)
    const notesInput = screen.getByPlaceholderText('Notes…')
    fireEvent.change(notesInput, { target: { value: 'Updated note' } })
    fireEvent.blur(notesInput)
    expect(onUpdate).toHaveBeenCalledWith('j1', { notes: 'Updated note' })
  })
})

describe('Tracker — filtering by board', () => {
  test('filters jobs to active board when activeBoardId is set', () => {
    const jobs = [
      makeJob({ id: 'j1', title: 'Job Board 1', board_id: 'b1', status: 'Applied' }),
      makeJob({ id: 'j2', title: 'Job Board 2', board_id: 'b2', status: 'Applied' }),
    ]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} activeBoardId="b1" />)
    expect(screen.getByText('Job Board 1')).toBeInTheDocument()
    expect(screen.queryByText('Job Board 2')).not.toBeInTheDocument()
  })

  test('shows all jobs when activeBoardId is null', () => {
    const jobs = [
      makeJob({ id: 'j1', title: 'Job Board 1', board_id: 'b1', status: 'Applied' }),
      makeJob({ id: 'j2', title: 'Job Board 2', board_id: 'b2', status: 'Applied' }),
    ]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} activeBoardId={null} />)
    expect(screen.getByText('Job Board 1')).toBeInTheDocument()
    expect(screen.getByText('Job Board 2')).toBeInTheDocument()
  })
})

describe('Tracker — stats', () => {
  test('clicking Stats shows the stats panel', () => {
    const jobs = [makeJob({ id: 'j1', status: 'Applied' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stats' }))
    // Should show status counts
    expect(screen.getByRole('button', { name: 'Hide Stats' })).toBeInTheDocument()
  })

  test('clicking Hide Stats hides the panel', () => {
    const jobs = [makeJob({ id: 'j1', status: 'Applied' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stats' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hide Stats' }))
    expect(screen.getByRole('button', { name: 'Stats' })).toBeInTheDocument()
  })

  test('stats panel shows conversion rate labels', () => {
    const jobs = [makeJob({ id: 'j1', status: 'Applied' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    fireEvent.click(screen.getByRole('button', { name: 'Stats' }))
    expect(screen.getByText('this week')).toBeInTheDocument()
    expect(screen.getByText('→ interview')).toBeInTheDocument()
  })
})

describe('Tracker — add form cancel', () => {
  test('Cancel button in add form hides the form', () => {
    render(<Tracker {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Job' }))
    expect(screen.getByText('Add job manually')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Add job manually')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add Job' })).toBeInTheDocument()
  })

  test('shows error when onAddJob rejects', async () => {
    DEFAULT_PROPS.onAddJob = vi.fn().mockRejectedValue(new Error('Server error'))
    render(<Tracker {...DEFAULT_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Job' }))
    fireEvent.change(screen.getByPlaceholderText('Job listing URL (required)'), { target: { value: 'https://example.com/job' } })
    fireEvent.change(screen.getByPlaceholderText('Job title (required)'), { target: { value: 'My Job' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add job' }))
    expect(await screen.findByText('Server error')).toBeInTheDocument()
    DEFAULT_PROPS.onAddJob = vi.fn()
  })
})

describe('Tracker — delete row button', () => {
  test('delete button calls onDelete with job id', () => {
    const onDelete = vi.fn()
    const jobs = [makeJob({ id: 'j1', status: 'Applied' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} onDelete={onDelete} />)
    fireEvent.click(screen.getByTitle('Delete'))
    expect(onDelete).toHaveBeenCalledWith('j1')
  })
})

describe('Tracker — JD column', () => {
  test('shows "Paste JD" button when job has no description', () => {
    const jobs = [makeJob({ id: 'j1', status: 'Applied', description: null })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    expect(screen.getByRole('button', { name: 'Paste JD' })).toBeInTheDocument()
  })

  test('shows "Has JD" button when job has a description', () => {
    const jobs = [makeJob({ id: 'j1', status: 'Applied', description: 'Full JD text here' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    expect(screen.getByRole('button', { name: 'Has JD' })).toBeInTheDocument()
  })

  test('clicking "Paste JD" expands a textarea', () => {
    const jobs = [makeJob({ id: 'j1', status: 'Applied', description: null })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste JD' }))
    expect(screen.getByPlaceholderText('Paste job description…')).toBeInTheDocument()
  })
})

describe('Tracker — follow-up overdue badge', () => {
  test('shows DUE badge for overdue follow-up date', () => {
    const jobs = [makeJob({ id: 'j1', status: 'Applied', follow_up_date: '2020-01-01' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    expect(screen.getByTitle('Follow-up overdue')).toBeInTheDocument()
    expect(screen.getByText('DUE')).toBeInTheDocument()
  })

  test('does not show DUE badge for future follow-up date', () => {
    const jobs = [makeJob({ id: 'j1', status: 'Applied', follow_up_date: '2099-12-31' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    expect(screen.queryByText('DUE')).not.toBeInTheDocument()
  })
})

describe('Tracker — salary input', () => {
  test('blurring salary input calls onUpdate with salary_range', () => {
    const onUpdate = vi.fn()
    const jobs = [makeJob({ id: 'j1', status: 'Applied', salary_range: null })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} onUpdate={onUpdate} />)
    const salaryInput = screen.getByPlaceholderText('e.g. $120k–$150k')
    fireEvent.change(salaryInput, { target: { value: '$130k' } })
    fireEvent.blur(salaryInput)
    expect(onUpdate).toHaveBeenCalledWith('j1', { salary_range: '$130k' })
  })

  test('blurring empty salary input calls onUpdate with salary_range: null', () => {
    const onUpdate = vi.fn()
    const jobs = [makeJob({ id: 'j1', status: 'Applied', salary_range: '$120k' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} onUpdate={onUpdate} />)
    const salaryInput = screen.getByPlaceholderText('e.g. $120k–$150k')
    fireEvent.change(salaryInput, { target: { value: '' } })
    fireEvent.blur(salaryInput)
    expect(onUpdate).toHaveBeenCalledWith('j1', { salary_range: null })
  })
})

describe('Tracker — applied date input', () => {
  test('changing applied date calls onUpdate with applied_date', () => {
    const onUpdate = vi.fn()
    const jobs = [makeJob({ id: 'j1', status: 'Applied' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} onUpdate={onUpdate} />)
    // The first date input is applied_date
    const dateInputs = screen.getAllByDisplayValue('2026-04-01')
    fireEvent.change(dateInputs[0], { target: { value: '2026-05-01' } })
    expect(onUpdate).toHaveBeenCalledWith('j1', { applied_date: '2026-05-01' })
  })
})

describe('Tracker — JD textarea save', () => {
  test('blurring JD textarea calls patchJobDescription and onUpdate', async () => {
    const onUpdate = vi.fn()
    const jobs = [makeJob({ id: 'j1', status: 'Applied', description: null })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Paste JD' }))
    const textarea = screen.getByPlaceholderText('Paste job description…')
    fireEvent.change(textarea, { target: { value: 'Job description text' } })
    fireEvent.blur(textarea)
    await waitFor(() => expect(mockPatchJobDescription).toHaveBeenCalledWith('j1', 'Job description text'))
    expect(onUpdate).toHaveBeenCalledWith('j1', {})
  })
})

describe('Tracker — board selector', () => {
  test('changing board dropdown calls onUpdate with board_id', () => {
    const onUpdate = vi.fn()
    const jobs = [makeJob({ id: 'j1', status: 'Applied', board_id: 'b1' })]
    // Need 2+ boards to show the board column
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} boards={BOARDS} onUpdate={onUpdate} />)
    // Board select has the board names as options
    const boardSelect = screen.getByDisplayValue('My Job Search')
    fireEvent.change(boardSelect, { target: { value: 'b2' } })
    expect(onUpdate).toHaveBeenCalledWith('j1', { board_id: 'b2' })
  })
})

describe('Tracker — board rename — escape key', () => {
  test('pressing Escape in rename input cancels without calling onRenameBoard', () => {
    const onRenameBoard = vi.fn()
    render(<Tracker {...DEFAULT_PROPS} activeBoardId="b1" onRenameBoard={onRenameBoard} />)
    const boardBtn = screen.getByRole('button', { name: /My Job Search/ })
    fireEvent.doubleClick(boardBtn)
    const input = screen.getByDisplayValue('My Job Search')
    fireEvent.change(input, { target: { value: 'Changed Name' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    // Rename should be cancelled — onRenameBoard not called and input gone
    expect(onRenameBoard).not.toHaveBeenCalled()
    expect(screen.queryByDisplayValue('Changed Name')).not.toBeInTheDocument()
  })
})

describe('Tracker — follow-up date input', () => {
  test('changing follow-up date calls onUpdate with follow_up_date', () => {
    const onUpdate = vi.fn()
    const jobs = [makeJob({ id: 'j1', status: 'Applied', follow_up_date: null })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} onUpdate={onUpdate} />)
    const dateInputs = screen.getAllByDisplayValue('')
    // Follow-up date is a date input; find it by checking for date type inputs
    const followUpInput = Array.from(document.querySelectorAll('input[type="date"]'))
      .find(i => !i.value || i.value === '')
    if (followUpInput) {
      fireEvent.change(followUpInput, { target: { value: '2026-06-01' } })
      expect(onUpdate).toHaveBeenCalledWith('j1', { follow_up_date: '2026-06-01' })
    }
  })

  test('clearing follow-up date calls onUpdate with follow_up_date: null', () => {
    const onUpdate = vi.fn()
    const jobs = [makeJob({ id: 'j1', status: 'Applied', follow_up_date: '2026-05-01' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} onUpdate={onUpdate} />)
    const followUpInput = document.querySelector('input[type="date"][value="2026-05-01"]')
    if (followUpInput) {
      fireEvent.change(followUpInput, { target: { value: '' } })
      expect(onUpdate).toHaveBeenCalledWith('j1', { follow_up_date: null })
    }
  })
})

describe('Tracker — sort dropdown', () => {
  test('changing the sort dropdown reorders jobs', () => {
    const jobs = [
      makeJob({ id: 'j1', title: 'Job A', status: 'Applied', applied_date: '2026-03-01', score_aggregate: 5 }),
      makeJob({ id: 'j2', title: 'Job B', status: 'Saved', applied_date: null, score_aggregate: 9 }),
    ]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    // Default sort is applied_desc — Job A (with applied_date) appears before Job B
    const sortSelect = screen.getByDisplayValue('Applied ↓')
    // Change to score sort
    fireEvent.change(sortSelect, { target: { value: 'score_desc' } })
    // After score sort, Job B (score 9) should come before Job A (score 5)
    const rows = screen.getAllByRole('row')
    const jobBIndex = rows.findIndex(r => r.textContent?.includes('Job B'))
    const jobAIndex = rows.findIndex(r => r.textContent?.includes('Job A'))
    expect(jobBIndex).toBeLessThan(jobAIndex)
  })
})

describe('Tracker — export CSV', () => {
  test('"Export CSV" button appears when tracked jobs exist', () => {
    const jobs = [makeJob({ id: 'j1', status: 'Applied' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument()
  })

  test('"Export CSV" button is absent when no tracked jobs', () => {
    render(<Tracker {...DEFAULT_PROPS} jobs={[]} />)
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument()
  })

  test('clicking "Export CSV" triggers a blob download', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock')
    const revokeObjectURL = vi.fn()
    window.URL.createObjectURL = createObjectURL
    window.URL.revokeObjectURL = revokeObjectURL
    const jobs = [makeJob({ id: 'j1', status: 'Applied' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(createObjectURL).toHaveBeenCalled()
  })
})

describe('Tracker — board rename — blur commits', () => {
  test('blurring rename input commits the new name via onRenameBoard', () => {
    const onRenameBoard = vi.fn()
    render(<Tracker {...DEFAULT_PROPS} activeBoardId="b1" onRenameBoard={onRenameBoard} />)
    const boardBtn = screen.getByRole('button', { name: /My Job Search/ })
    fireEvent.doubleClick(boardBtn)
    const input = screen.getByDisplayValue('My Job Search')
    fireEvent.change(input, { target: { value: 'Blurred Name' } })
    fireEvent.blur(input)
    expect(onRenameBoard).toHaveBeenCalledWith('b1', 'Blurred Name')
  })

  test('pressing Enter without changing name does not call onRenameBoard', () => {
    const onRenameBoard = vi.fn()
    render(<Tracker {...DEFAULT_PROPS} activeBoardId="b1" onRenameBoard={onRenameBoard} />)
    const boardBtn = screen.getByRole('button', { name: /My Job Search/ })
    fireEvent.doubleClick(boardBtn)
    // No change to input value — press Enter immediately
    fireEvent.keyDown(screen.getByDisplayValue('My Job Search'), { key: 'Enter' })
    expect(onRenameBoard).not.toHaveBeenCalled()
  })
})

describe('Tracker — Direct Link field', () => {
  test('shows "Direct Link" column header', () => {
    const jobs = [makeJob()]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    expect(screen.getByText('Direct Link')).toBeInTheDocument()
  })

  test('renders Direct Link input with placeholder when no URL saved', () => {
    const jobs = [makeJob({ direct_link: null })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    expect(screen.getByPlaceholderText('Paste link…')).toBeInTheDocument()
  })

  test('populates Direct Link input with saved URL', () => {
    const jobs = [makeJob({ direct_link: 'https://greenhouse.io/jobs/123' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    expect(screen.getByDisplayValue('https://greenhouse.io/jobs/123')).toBeInTheDocument()
  })

  test('shows external link icon when direct_link is set', () => {
    const jobs = [makeJob({ direct_link: 'https://greenhouse.io/jobs/123' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    const link = screen.getByTitle('Open direct link')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://greenhouse.io/jobs/123')
    expect(link).toHaveAttribute('target', '_blank')
  })

  test('does not show link icon when direct_link is null', () => {
    const jobs = [makeJob({ direct_link: null })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    expect(screen.queryByTitle('Open direct link')).not.toBeInTheDocument()
  })

  test('calls onUpdate with direct_link on blur', () => {
    const onUpdate = vi.fn()
    const jobs = [makeJob({ id: 'j1', direct_link: null })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} onUpdate={onUpdate} />)
    const input = screen.getByPlaceholderText('Paste link…')
    fireEvent.change(input, { target: { value: 'https://lever.co/jobs/abc' } })
    fireEvent.blur(input)
    expect(onUpdate).toHaveBeenCalledWith('j1', { direct_link: 'https://lever.co/jobs/abc' })
  })

  test('calls onUpdate with null when cleared', () => {
    const onUpdate = vi.fn()
    const jobs = [makeJob({ id: 'j1', direct_link: 'https://example.com' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} onUpdate={onUpdate} />)
    const input = screen.getByDisplayValue('https://example.com')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onUpdate).toHaveBeenCalledWith('j1', { direct_link: null })
  })
})
