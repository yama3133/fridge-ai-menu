import type { NextApiRequest, NextApiResponse } from 'next'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { getServerSession } from 'next-auth/next'
import { eq } from 'drizzle-orm'
import { initializeVisionClient } from '../../lib/gcp-auth'
import { authOptions } from './auth/[...nextauth]'
import { db } from '@/lib/db'
import { healthProfiles } from '@/lib/db/schema'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
}

type Nutrition = {
  calories: number
  protein_g: number
  fat_g: number
  carbs_g: number
  sodium_mg: number
  fiber_g: number
}

type MenuItem = {
  name: string
  description: string
  ingredients: string[] // 使用する全食材（記録・後方互換用）
  haveIngredients: string[] // 冷蔵庫にある食材
  needIngredients: string[] // 買い足す必要がある食材
  cookingTime: string
  difficulty: string
  nutrition: Nutrition
}

type AnalyzeResponse = {
  success: boolean
  ingredients?: string[]
  menus?: MenuItem[]
  hasHealthGoal?: boolean
  error?: string
}

type ClaudeResult = {
  ingredients: string[]
  menus: MenuItem[]
}

// US(us-east-1) の Claude Sonnet 4.5 推論プロファイル
const MODEL_ID = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'

// 出力言語の指定（料理名・説明・食材名をこの言語で生成させる）
const LANG_NAME: Record<string, string> = {
  ja: '日本語 (Japanese)',
  en: 'English',
  zh: '简体中文 (Simplified Chinese)',
  ko: '한국어 (Korean)',
  fr: 'Français (French)',
  es: 'Español (Spanish)',
  pt: 'Português (Portuguese)',
}

const GOAL_LABEL: Record<string, string> = {
  diet: 'ダイエット（減量）',
  muscle: '筋肉増量',
  maintain: '現状維持',
}
const SEX_LABEL: Record<string, string> = {
  male: '男性',
  female: '女性',
  other: 'その他',
}
const ACTIVITY_LABEL: Record<string, string> = {
  low: '低い（座り仕事中心）',
  moderate: '普通',
  high: '高い（運動習慣あり）',
}

function parseClaudeResponse(text: string): ClaudeResult {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) return JSON.parse(jsonMatch[0])
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlock) return JSON.parse(codeBlock[1])
  } catch {
    // fallthrough
  }
  return { ingredients: [], menus: [] }
}

type HealthProfile = typeof healthProfiles.$inferSelect

// 健康目標をプロンプト用テキストに整形
function buildHealthSection(profile: HealthProfile | null): string {
  if (!profile) {
    return '（健康目標の登録なし。一般的に栄養バランスの良い献立を提案してください）'
  }
  const lines = [
    profile.goal && `- 目標タイプ: ${GOAL_LABEL[profile.goal] ?? profile.goal}`,
    profile.targetCalories != null && `- 1日の目標カロリー: ${profile.targetCalories} kcal`,
    profile.targetProteinG != null && `- 1日の目標タンパク質: ${profile.targetProteinG} g`,
    profile.targetSodiumMg != null && `- 1日の塩分上限: ${profile.targetSodiumMg} mg`,
    profile.targetFiberG != null && `- 1日の食物繊維目標: ${profile.targetFiberG} g`,
    profile.age != null && `- 年齢: ${profile.age}`,
    profile.sex && `- 性別: ${SEX_LABEL[profile.sex] ?? profile.sex}`,
    profile.activityLevel && `- 活動量: ${ACTIVITY_LABEL[profile.activityLevel] ?? profile.activityLevel}`,
  ].filter(Boolean)

  return `この方の健康目標に合わせた献立を優先的に提案してください。
${lines.join('\n')}
特に、塩分・カロリーの上限と、タンパク質・食物繊維の目標を意識した献立にしてください。`
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnalyzeResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const { imageBase64, lang } = req.body as { imageBase64: string; lang?: string }
  if (!imageBase64) {
    return res.status(400).json({ success: false, error: 'imageBase64 is required' })
  }
  const langName = LANG_NAME[lang ?? 'ja'] ?? LANG_NAME.ja

  const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/)
  const mediaType = (match?.[1] ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  const base64Data = match?.[2] ?? imageBase64

  try {
    // ログインユーザーの健康目標プロフィールを取得（未ログインでも動作）
    let profile: HealthProfile | null = null
    const session = await getServerSession(req, res, authOptions)
    if (session?.user?.id) {
      const rows = await db
        .select()
        .from(healthProfiles)
        .where(eq(healthProfiles.userId, session.user.id))
        .limit(1)
      profile = rows[0] ?? null
    }
    const healthSection = buildHealthSection(profile)

    // Step 1: Vision API の TEXT_DETECTION でラベルの文字を全部読み取る
    const visionClient = initializeVisionClient()
    const [textResult] = await visionClient.textDetection({
      image: { content: base64Data },
    })

    const ocrText = textResult.fullTextAnnotation?.text ?? ''
    const hasOcrText = ocrText.trim().length > 0

    // Step 2: OCR テキスト + 画像を Claude に渡して食材特定・献立提案
    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    })

    const ocrSection = hasOcrText
      ? `【画像から読み取ったテキスト（OCR）】\n${ocrText}\n\n上記テキストを最優先情報として使用してください。`
      : '（テキスト読み取り結果なし）'

    const prompt = `冷蔵庫の写真を分析し、健康目標に合わせた献立を提案してください。

${ocrSection}

【ユーザーの健康目標】
${healthSection}

【指示】
1. OCRテキストを最優先で使用し、ラベルに書いてある商品名・食材名を特定してください
2. 例：「ブルーベリー ジャム」と書いてあればジャム、「いちご ジャム」と書いてあればジャム
3. テキストが読めない商品は「不明な容器」など形状のみで記述し、中身を推測しない
4. 見た目の形状・色だけで食品を判断しない（丸い容器→アイスなど禁止）
5. 各献立には1人前あたりの栄養価の概算（カロリー・タンパク質・脂質・炭水化物・塩分・食物繊維）を必ず付けてください
6. 健康目標がある場合は、それに沿う献立を優先してください
7. 各献立の食材を「冷蔵庫にある食材(haveIngredients)」と「買い足す必要がある食材(needIngredients)」に分けてください。冷蔵庫の写真/OCRで確認できた食材は have、それ以外で料理に必要なものは need に入れます。ingredients には両方を合わせた全食材を入れてください
8. 出力する料理名・説明・食材名・調理時間・難易度は必ず ${langName} で記述してください（栄養の数値は除く）

以下のJSON形式のみで回答してください（キー名は英語のまま、値は ${langName} で）：

{
  "ingredients": ["特定できた食材・食品名（${langName}）"],
  "menus": [
    {
      "name": "料理名",
      "description": "料理の説明（40文字以内）",
      "ingredients": ["使用する全食材"],
      "haveIngredients": ["冷蔵庫にある食材"],
      "needIngredients": ["買い足す必要がある食材"],
      "cookingTime": "調理時間（例：20分）",
      "difficulty": "難易度（簡単/普通/難しい）",
      "nutrition": {
        "calories": 1人前のカロリー(kcal, 数値),
        "protein_g": タンパク質(g, 数値),
        "fat_g": 脂質(g, 数値),
        "carbs_g": 炭水化物(g, 数値),
        "sodium_mg": 塩分(mg, 数値),
        "fiber_g": 食物繊維(g, 数値)
      }
    }
  ]
}`

    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 3072,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64Data },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    })

    const response = await bedrockClient.send(command)
    const body = JSON.parse(new TextDecoder().decode(response.body))
    const { ingredients, menus } = parseClaudeResponse(body.content[0].text)

    return res.status(200).json({
      success: true,
      ingredients,
      menus,
      hasHealthGoal: profile != null,
    })
  } catch (err: unknown) {
    console.error('analyze-fridge error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ success: false, error: message })
  }
}
