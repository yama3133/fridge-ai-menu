import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { and, desc, eq, gte } from 'drizzle-orm'
import { authOptions } from './auth/[...nextauth]'
import { db } from '@/lib/db'
import { mealLogs } from '@/lib/db/schema'

// 数値を numeric カラム用の文字列に（不正値はnull）
function toNumStr(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : null
}

// YYYY-MM-DD（ローカル日付）
function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const userId = session.user.id

  // 記録（「食べた」）
  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Record<string, unknown>
    const menuName = typeof body.menuName === 'string' ? body.menuName.trim() : ''
    if (!menuName) {
      return res.status(400).json({ error: 'menuName is required' })
    }
    const nutrition = (body.nutrition ?? {}) as Record<string, unknown>
    const ingredients = Array.isArray(body.ingredients)
      ? (body.ingredients as unknown[]).filter((x): x is string => typeof x === 'string')
      : []

    const [row] = await db
      .insert(mealLogs)
      .values({
        userId,
        menuName,
        description: typeof body.description === 'string' ? body.description : null,
        ingredients,
        calories: toNumStr(nutrition.calories),
        proteinG: toNumStr(nutrition.protein_g),
        fatG: toNumStr(nutrition.fat_g),
        carbsG: toNumStr(nutrition.carbs_g),
        sodiumMg: toNumStr(nutrition.sodium_mg),
        fiberG: toNumStr(nutrition.fiber_g),
      })
      .returning()

    return res.status(201).json({ mealLog: row })
  }

  // 取得（range: today | week、デフォルト week）
  if (req.method === 'GET') {
    const range = (req.query.range as string) ?? 'week'
    const today = new Date()
    let fromStr: string
    if (range === 'today') {
      fromStr = dateStr(today)
    } else {
      const from = new Date(today)
      from.setDate(today.getDate() - 6) // 直近7日
      fromStr = dateStr(from)
    }

    const rows = await db
      .select()
      .from(mealLogs)
      .where(and(eq(mealLogs.userId, userId), gte(mealLogs.eatenAt, fromStr)))
      .orderBy(desc(mealLogs.eatenAt), desc(mealLogs.createdAt))

    return res.status(200).json({ mealLogs: rows })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}
