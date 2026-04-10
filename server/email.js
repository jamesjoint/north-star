import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM || 'noreply@example.com'
const APP_NAME = 'JobMatch'

export async function sendMagicLinkEmail({ to, url }) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your ${APP_NAME} sign-in link`,
    html: `
      <p>Click below to sign in to ${APP_NAME}. This link expires in 15 minutes.</p>
      <p><a href="${url}" style="background:#6d28d9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Sign in to ${APP_NAME}</a></p>
      <p style="color:#888;font-size:12px">If you didn't request this, you can ignore this email.</p>
    `,
  })
}

export async function sendWaitlistConfirmationEmail({ to }) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `You're on the ${APP_NAME} waitlist`,
    html: `
      <p>Thanks for signing up! You're on the ${APP_NAME} waitlist.</p>
      <p>We'll send you a sign-in link as soon as your account is approved.</p>
    `,
  })
}

export async function sendApprovalEmail({ to }) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `You're in — sign in to ${APP_NAME}`,
    html: `
      <p>Good news — your ${APP_NAME} account has been approved!</p>
      <p>Go to <a href="${process.env.BETTER_AUTH_URL}">${process.env.BETTER_AUTH_URL}</a> and enter your email to get a sign-in link.</p>
    `,
  })
}

/**
 * Send a daily digest email listing new jobs.
 * @param {object} opts
 * @param {string} opts.to - recipient email
 * @param {number} opts.total - total new jobs scraped
 * @param {Array<{title:string,company:string,location:string,score_aggregate:number|null}>} opts.topJobs - up to 5 top-scoring jobs
 */
export async function sendDigestEmail({ to, total, topJobs }) {
  const appUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3001'
  const jobRows = topJobs.map(j => {
    const score = j.score_aggregate != null ? ` &mdash; score ${Number(j.score_aggregate).toFixed(1)}` : ''
    const location = j.location ? ` &middot; ${j.location}` : ''
    return `<li style="margin:6px 0"><strong>${j.title}</strong> at ${j.company}${location}${score}</li>`
  }).join('\n')

  await resend.emails.send({
    from: FROM,
    to,
    subject: `${APP_NAME}: ${total} new job${total !== 1 ? 's' : ''} today`,
    html: `
      <p>Hi! ${APP_NAME} found <strong>${total} new job${total !== 1 ? 's' : ''}</strong> today.</p>
      ${topJobs.length > 0 ? `
      <p><strong>Top matches:</strong></p>
      <ul style="padding-left:20px">
        ${jobRows}
      </ul>` : ''}
      <p><a href="${appUrl}" style="background:#6d28d9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">View all jobs</a></p>
      <p style="color:#888;font-size:12px">You're receiving this because you have a ${APP_NAME} account.</p>
    `,
  })
}
