import type { NextApiRequest, NextApiResponse } from 'next'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { getServerSession } from 'next-auth/next'
import { and, desc, eq, gte } from 'drizzle-orm'
import { authOptions } from '../auth/[...nextauth]'
import { db } from '@/lib/db'
import { mealLogs, healthProfiles, coachAdvices } from '@/lib/db/schema'

const MODEL_ID = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'

const LANG_NAME: Record<string, string> = {
  ja: '日本語 (Japanese)',
  en: 'English',
  zh: '简体中文 (Simplified Chinese)',
  ko: '한국어 (Korean)',
  fr: 'Français (French)',
  es: 'Español (Spanish)',
  pt: 'Português (Portuguese)',
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const dateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

type CoachAdvice = {
  summaryText: string
  achievements: string[]
  shortfalls: string[]
  tomorrow: string[]
}

function parseAdvice(text: string): CoachAdvice | null {
  try {
    const m = text.match(/\{[\s\S]*\}/)
    if (m) return JSON.parse(m[0])
  } catch {
    // fallthrough
  }
  return null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const userId = session.user.id
  const lang = (req.query.lang as string) ?? (req.body?.lang as string) ?? 'ja'
  const langName = LANG_NAME[lang] ?? LANG_NAME.ja

  try {
    // 直近7日の集計
    const today = new Date()
    const from = new Date(today)
    from.setDate(today.getDate() - 6)
    const fromStr = dateStr(from)

    const rows = await db
      .select()
      .from(mealLogs)
      .where(and(eq(mealLogs.userId, userId), gte(mealLogs.eatenAt, fromStr)))
      .orderBy(desc(mealLogs.eatenAt))

    if (rows.length === 0) {
      return res.status(200).json({ hasData: false })
    }

    // 日数（記録のある日）を数えて1日平均を出す
    const dates = new Set(rows.map((r) => r.eatenAt))
    const dayCount = Math.max(dates.size, 1)

    const total = rows.reduce(
      (acc, r) => {
        acc.kcal += num(r.calories)
        acc.protein += num(r.proteinG)
        acc.fat += num(r.fatG)
        acc.carbs += num(r.carbsG)
        acc.sodium += num(r.sodiumMg)
        acc.fiber += num(r.fiberG)
        return acc
      },
      { kcal: 0, protein: 0, fat: 0, carbs: 0, sodium: 0, fiber: 0 }
    )

    const avg = {
      kcal: Math.round(total.kcal / dayCount),
      protein: Math.round(total.protein / dayCount),
      fat: Math.round(total.fat / dayCount),
      carbs: Math.round(total.carbs / dayCount),
      sodium: Math.round(total.sodium / dayCount),
      fiber: Math.round(total.fiber / dayCount),
    }

    const profileRows = await db
      .select()
      .from(healthProfiles)
      .where(eq(healthProfiles.userId, userId))
      .limit(1)
    const profile = profileRows[0] ?? null

    const summary = {
      periodStart: fromStr,
      periodEnd: dateStr(today),
      recordedDays: dayCount,
      mealCount: rows.length,
      dailyAverage: avg,
      target: profile
        ? {
            calories: profile.targetCalories,
            protein_g: profile.targetProteinG,
            sodium_mg: profile.targetSodiumMg,
            fiber_g: profile.targetFiberG,
            goal: profile.goal,
          }
        : null,
    }

    const prompt = `あなたは栄養管理の専門家（ヘルスコーチ）です。
ユーザーの直近7日間の食事記録の集計と健康目標を渡します。
励ましつつ、具体的で実行しやすいアドバイスをしてください。

【集計データ（JSON）】
${JSON.stringify(summary, null, 2)}

【出力指示】
- すべて ${langName} で記述してください
- 以下のJSON形式のみで回答してください（キー名は英語のまま）：

{
  "summaryText": "今週の総評（2〜3文）",
  "achievements": ["できている点（1〜3個）"],
  "shortfalls": ["不足・改善すべき点（1〜3個）"],
  "tomorrow": ["明日からの具体的な提案（2〜3個）"]
}`

    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    })

    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1500,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      }),
    })

    const response = await client.send(command)
    const body = JSON.parse(new TextDecoder().decode(response.body))
    const advice = parseAdvice(body.content[0].text)

    if (!advice) {
      return res.status(500).json({ error: 'Failed to parse advice' })
    }

    // 履歴保存
    await db.insert(coachAdvices).values({
      userId,
      periodStart: fromStr,
      periodEnd: dateStr(today),
      summary,
      advice: JSON.stringify(advice),
    })

    return res.status(200).json({ hasData: true, summary, advice })
  } catch (err: unknown) {
    console.error('coach/weekly error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}
