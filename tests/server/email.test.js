import { describe, test, expect, vi, beforeEach } from 'vitest'

let mockEmailsSend = vi.fn()

vi.mock('resend', () => {
  class Resend {
    constructor() {
      this.emails = { send: mockEmailsSend }
    }
  }
  return { Resend }
})

beforeEach(() => {
  vi.clearAllMocks()
  mockEmailsSend.mockResolvedValue({ id: 'mock-email-id' })
})

describe('sendMagicLinkEmail', () => {
  test('sends email to the given address', async () => {
    const { sendMagicLinkEmail } = await import('../../server/email.js?t=' + Date.now())
    await sendMagicLinkEmail({ to: 'user@example.com', url: 'https://example.com/auth?token=abc' })
    expect(mockEmailsSend).toHaveBeenCalledTimes(1)
    const call = mockEmailsSend.mock.calls[0][0]
    expect(call.to).toBe('user@example.com')
  })

  test('includes the sign-in URL in the email HTML', async () => {
    const { sendMagicLinkEmail } = await import('../../server/email.js?t=' + Date.now())
    const url = 'https://example.com/auth?token=xyz'
    await sendMagicLinkEmail({ to: 'user@example.com', url })
    const call = mockEmailsSend.mock.calls[0][0]
    expect(call.html).toContain(url)
  })

  test('subject mentions sign-in', async () => {
    const { sendMagicLinkEmail } = await import('../../server/email.js?t=' + Date.now())
    await sendMagicLinkEmail({ to: 'user@example.com', url: 'https://example.com/token' })
    const call = mockEmailsSend.mock.calls[0][0]
    expect(call.subject).toMatch(/sign.in/i)
  })
})

describe('sendWaitlistConfirmationEmail', () => {
  test('sends email to the given address', async () => {
    const { sendWaitlistConfirmationEmail } = await import('../../server/email.js?t=' + Date.now())
    await sendWaitlistConfirmationEmail({ to: 'waitlisted@example.com' })
    expect(mockEmailsSend).toHaveBeenCalledTimes(1)
    const call = mockEmailsSend.mock.calls[0][0]
    expect(call.to).toBe('waitlisted@example.com')
  })

  test('subject mentions waitlist', async () => {
    const { sendWaitlistConfirmationEmail } = await import('../../server/email.js?t=' + Date.now())
    await sendWaitlistConfirmationEmail({ to: 'waitlisted@example.com' })
    const call = mockEmailsSend.mock.calls[0][0]
    expect(call.subject).toMatch(/waitlist/i)
  })
})

describe('sendApprovalEmail', () => {
  test('sends email to the given address', async () => {
    const { sendApprovalEmail } = await import('../../server/email.js?t=' + Date.now())
    await sendApprovalEmail({ to: 'approved@example.com' })
    expect(mockEmailsSend).toHaveBeenCalledTimes(1)
    const call = mockEmailsSend.mock.calls[0][0]
    expect(call.to).toBe('approved@example.com')
  })

  test('subject mentions account approval', async () => {
    const { sendApprovalEmail } = await import('../../server/email.js?t=' + Date.now())
    await sendApprovalEmail({ to: 'approved@example.com' })
    const call = mockEmailsSend.mock.calls[0][0]
    expect(call.subject).toMatch(/in|approved/i)
  })
})

describe('sendDigestEmail', () => {
  const TOP_JOBS = [
    { title: 'PM', company: 'Acme', location: 'Remote', score_aggregate: 8.5 },
    { title: 'Designer', company: 'Corp', location: null, score_aggregate: null },
  ]

  test('sends email to the given address', async () => {
    const { sendDigestEmail } = await import('../../server/email.js?t=' + Date.now())
    await sendDigestEmail({ to: 'user@example.com', total: 5, topJobs: TOP_JOBS })
    expect(mockEmailsSend).toHaveBeenCalledTimes(1)
    const call = mockEmailsSend.mock.calls[0][0]
    expect(call.to).toBe('user@example.com')
  })

  test('subject includes total count', async () => {
    const { sendDigestEmail } = await import('../../server/email.js?t=' + Date.now())
    await sendDigestEmail({ to: 'user@example.com', total: 7, topJobs: [] })
    const call = mockEmailsSend.mock.calls[0][0]
    expect(call.subject).toContain('7')
  })

  test('HTML includes job titles', async () => {
    const { sendDigestEmail } = await import('../../server/email.js?t=' + Date.now())
    await sendDigestEmail({ to: 'user@example.com', total: 2, topJobs: TOP_JOBS })
    const call = mockEmailsSend.mock.calls[0][0]
    expect(call.html).toContain('PM')
    expect(call.html).toContain('Acme')
  })

  test('HTML includes formatted score when present', async () => {
    const { sendDigestEmail } = await import('../../server/email.js?t=' + Date.now())
    await sendDigestEmail({ to: 'user@example.com', total: 1, topJobs: TOP_JOBS })
    const call = mockEmailsSend.mock.calls[0][0]
    expect(call.html).toContain('8.5')
  })

  test('subject uses singular "job" for total of 1', async () => {
    const { sendDigestEmail } = await import('../../server/email.js?t=' + Date.now())
    await sendDigestEmail({ to: 'user@example.com', total: 1, topJobs: [] })
    const call = mockEmailsSend.mock.calls[0][0]
    expect(call.subject).toMatch(/1 new job[^s]/)
  })

  test('subject uses plural "jobs" for total > 1', async () => {
    const { sendDigestEmail } = await import('../../server/email.js?t=' + Date.now())
    await sendDigestEmail({ to: 'user@example.com', total: 3, topJobs: [] })
    const call = mockEmailsSend.mock.calls[0][0]
    expect(call.subject).toContain('3 new jobs')
  })

  test('sends no job list section when topJobs is empty', async () => {
    const { sendDigestEmail } = await import('../../server/email.js?t=' + Date.now())
    await sendDigestEmail({ to: 'user@example.com', total: 5, topJobs: [] })
    const call = mockEmailsSend.mock.calls[0][0]
    expect(call.html).not.toContain('<ul')
  })
})
