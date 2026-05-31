import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

// 一時的なmigration実行エンドポイント（本番DBへスキーマ適用）。
// 使い終わったら削除 or MIGRATE_SECRET を外して無効化すること。
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.MIGRATE_SECRET
  const provided = req.query.secret ?? req.headers['x-migrate-secret']

  if (!secret || provided !== secret) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  try {
    const dir = path.join(process.cwd(), 'drizzle')
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    const results: { file: string; statements: number }[] = []

    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8')
      // drizzle-kit が挿入する区切りで分割
      const statements = content
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean)

      for (const stmt of statements) {
        await db.execute(sql.raw(stmt))
      }
      results.push({ file, statements: statements.length })
    }

    // 作成済みテーブルを確認
    const tables = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`
    )

    return res.status(200).json({ ok: true, applied: results, tables: tables.rows })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ ok: false, error: message })
  }
}
