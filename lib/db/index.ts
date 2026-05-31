import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool, type PoolConfig } from 'pg'
import * as schema from './schema'

// 開発時のホットリロードでコネクションが増えないようグローバルに保持
const globalForDb = globalThis as unknown as { __pgPool?: Pool }

// 接続方式の判定:
//   - DATABASE_URL があれば従来の接続文字列方式（ローカル開発 / docker）
//   - なければ Vercel Marketplace の Aurora 統合（RDS IAM認証 + OIDC）
function buildPool(): Pool {
  const url = process.env.DATABASE_URL
  if (url) {
    return new Pool({ connectionString: url })
  }

  // RDS IAM認証（本番 / Vercel）。password に毎回トークンを生成する関数を渡す
  const host = process.env.DATABASE_PGHOST
  const user = process.env.DATABASE_PGUSER
  const region = process.env.DATABASE_AWS_REGION
  const roleArn = process.env.DATABASE_AWS_ROLE_ARN
  const port = Number(process.env.DATABASE_PGPORT ?? 5432)
  const database = process.env.DATABASE_PGDATABASE ?? 'postgres'

  if (!host || !user || !region) {
    throw new Error(
      'DB接続情報が不足しています（DATABASE_URL もしくは DATABASE_PGHOST/PGUSER/AWS_REGION）'
    )
  }

  // 依存（@aws-sdk/rds-signer, @vercel/functions）はIAM接続時のみ読み込む
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { Signer } = require('@aws-sdk/rds-signer')
  const { awsCredentialsProvider } = require('@vercel/functions/oidc')
  /* eslint-enable @typescript-eslint/no-var-requires */

  const signer = new Signer({
    hostname: host,
    port,
    username: user,
    region,
    credentials: awsCredentialsProvider({
      roleArn,
      clientConfig: { region },
    }),
  })

  const config: PoolConfig = {
    host,
    user,
    database,
    port,
    password: () => signer.getAuthToken(),
    ssl: { rejectUnauthorized: false },
    max: 10,
  }
  return new Pool(config)
}

const pool = globalForDb.__pgPool ?? buildPool()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__pgPool = pool
}

export const db = drizzle(pool, { schema })
export { schema }
