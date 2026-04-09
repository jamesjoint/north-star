import { configDotenv } from 'dotenv'
configDotenv()
// Point better-auth at the test database during all test runs
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST
}
import '@testing-library/jest-dom'
