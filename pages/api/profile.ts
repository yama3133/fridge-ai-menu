import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { eq } from 'drizzle-orm'
import { authOptions } from './auth/[...nextauth]'
import { db } from '@/lib/db'
import { healthProfiles } from '@/lib/db/schema'

// 文字列/数値を安全に整数 or null へ変換
function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}

const ALLOWED_SEX = ['male', 'female', 'other']
const ALLOWED_ACTIVITY = ['low', 'moderate', 'high']
const ALLOWED_GOAL = ['diet', 'muscle', 'maintain']

function toEnumOrNull(v: unknown, allowed: string[]): string | null {
  return typeof v === 'string' && allowed.includes(v) ? v : null
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

  // 健康目標プロフィールの取得
  if (req.method === 'GET') {
    const rows = await db
      .select()
      .from(healthProfiles)
      .where(eq(healthProfiles.userId, userId))
      .limit(1)
    return res.status(200).json({ profile: rows[0] ?? null })
  }

  // 健康目標プロフィールの作成・更新（upsert）
  if (req.method === 'PUT') {
    const body = (req.body ?? {}) as Record<string, unknown>
    const values = {
      userId,
      age: toIntOrNull(body.age),
      sex: toEnumOrNull(body.sex, ALLOWED_SEX),
      activityLevel: toEnumOrNull(body.activityLevel, ALLOWED_ACTIVITY),
      targetCalories: toIntOrNull(body.targetCalories),
      targetProteinG: toIntOrNull(body.targetProteinG),
      targetSodiumMg: toIntOrNull(body.targetSodiumMg),
      targetFiberG: toIntOrNull(body.targetFiberG),
      goal: toEnumOrNull(body.goal, ALLOWED_GOAL),
      updatedAt: new Date(),
    }

    const [profile] = await db
      .insert(healthProfiles)
      .values(values)
      .onConflictDoUpdate({
        target: healthProfiles.userId,
        set: {
          age: values.age,
          sex: values.sex,
          activityLevel: values.activityLevel,
          targetCalories: values.targetCalories,
          targetProteinG: values.targetProteinG,
          targetSodiumMg: values.targetSodiumMg,
          targetFiberG: values.targetFiberG,
          goal: values.goal,
          updatedAt: values.updatedAt,
        },
      })
      .returning()

    return res.status(200).json({ profile })
  }

  res.setHeader('Allow', 'GET, PUT')
  return res.status(405).json({ error: 'Method not allowed' })
}
