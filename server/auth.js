import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import pg from 'pg'
import { sendMagicLinkEmail } from './email.js'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3001',
  secret: process.env.BETTER_AUTH_SECRET,
  user: {
    additionalFields: {
      role:   { type: 'string', defaultValue: 'user',    required: false },
      status: { type: 'string', defaultValue: 'pending', required: false },
    }
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ to: email, url })
      },
      expiresIn: 900, // 15 minutes
    })
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    cookieCache: { enabled: true, maxAge: 60 * 5 }
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL || 'http://localhost:3001'],
})

export { fromNodeHeaders } from 'better-auth/node'

// Lazy adapter — auth.$context is a cached Promise, safe to await on every request
export const db = {
  findOne: (opts) => auth.$context.then(ctx => ctx.adapter.findOne(opts)),
  create:  (opts) => auth.$context.then(ctx => ctx.adapter.create(opts)),
}
