import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// .env.local を読み込む（drizzle-kit CLI 実行時用）
config({ path: '.env.local' })

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
})
