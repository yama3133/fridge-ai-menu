import type { NextApiRequest, NextApiResponse } from 'next'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { initializeVisionClient } from '../../lib/gcp-auth'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
}

type MenuItem = {
  name: string
  description: string
  ingredients: string[]
  cookingTime: string
  difficulty: string
}

type AnalyzeResponse = {
  success: boolean
  ingredients?: string[]
  menus?: MenuItem[]
  error?: string
}

const FOOD_KEYWORDS = [
  // 野菜
  'vegetable', 'carrot', 'broccoli', 'spinach', 'lettuce', 'cabbage', 'onion',
  'potato', 'tomato', 'cucumber', 'pepper', 'eggplant', 'zucchini', 'celery',
  'asparagus', 'corn', 'peas', 'bean', 'mushroom', 'garlic', 'ginger',
  'daikon', 'radish', 'leek', 'scallion', 'pumpkin', 'squash', 'beet',
  // 肉・魚
  'meat', 'chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'shrimp',
  'seafood', 'egg', 'tofu', 'sausage', 'ham', 'bacon',
  // 乳製品
  'dairy', 'cheese', 'milk', 'butter', 'cream', 'yogurt',
  // 果物
  'fruit', 'apple', 'orange', 'banana', 'strawberry', 'grape', 'lemon',
  'lime', 'mango', 'pineapple', 'watermelon', 'blueberry',
  // 調味料・その他
  'sauce', 'condiment', 'dressing', 'mayo', 'ketchup', 'mustard',
  'oil', 'vinegar', 'soy', 'miso', 'bread', 'pasta', 'rice', 'noodle',
  // 日本語キーワード（ラベルが日本語の場合）
  '野菜', '肉', '魚', '卵', '豆腐', '牛乳', 'チーズ', '果物',
]

function filterFoodIngredients(labels: string[]): string[] {
  const lowerLabels = labels.map(l => l.toLowerCase())
  const foodItems = lowerLabels.filter(label =>
    FOOD_KEYWORDS.some(keyword => label.includes(keyword.toLowerCase()))
  )
  return [...new Set(foodItems)].slice(0, 15)
}

function parseMenusFromResponse(text: string): MenuItem[] {
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1])
    }
  } catch {
    // JSON parse failed, return empty
  }
  return []
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnalyzeResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const { imageBase64 } = req.body as { imageBase64: string }

  if (!imageBase64) {
    return res.status(400).json({ success: false, error: 'imageBase64 is required' })
  }

  // Strip data URL prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

  try {
    // Step 1: Google Cloud Vision で食材検出
    const visionClient = initializeVisionClient()

    const [labelResult, objectResult] = await Promise.all([
      visionClient.labelDetection({
        image: { content: base64Data },
        imageContext: { languageHints: ['ja', 'en'] },
      }),
      visionClient.objectLocalization({
        image: { content: base64Data },
      }),
    ])

    const labelDescriptions = (labelResult[0].labelAnnotations ?? [])
      .filter(l => (l.score ?? 0) > 0.6)
      .map(l => l.description ?? '')

    const objectDescriptions = (objectResult[0].localizedObjectAnnotations ?? [])
      .filter(o => (o.score ?? 0) > 0.5)
      .map(o => o.name ?? '')

    const allLabels = [...labelDescriptions, ...objectDescriptions]
    const ingredients = filterFoodIngredients(allLabels)

    if (ingredients.length === 0) {
      return res.status(200).json({
        success: true,
        ingredients: [],
        menus: [],
      })
    }

    // Step 2: AWS Bedrock で献立提案
    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? 'ap-northeast-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    })

    const prompt = `あなたは料理の専門家です。冷蔵庫に以下の食材があります：

食材: ${ingredients.join('、')}

これらの食材を使って作れる献立を3つ提案してください。
必ず以下のJSON配列形式で回答してください：

[
  {
    "name": "料理名",
    "description": "料理の説明（50文字以内）",
    "ingredients": ["使用する食材1", "使用する食材2"],
    "cookingTime": "調理時間（例：20分）",
    "difficulty": "難易度（簡単/普通/難しい）"
  }
]

JSON配列のみを返してください。余分な説明は不要です。`

    const command = new InvokeModelCommand({
      modelId: 'us.anthropic.claude-sonnet-4-5-20251101-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    const bedrockResponse = await bedrockClient.send(command)
    const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body))
    const responseText = responseBody.content[0].text as string

    const menus = parseMenusFromResponse(responseText)

    return res.status(200).json({ success: true, ingredients, menus })
  } catch (err: unknown) {
    console.error('analyze-fridge error:', err)

    const message = err instanceof Error ? err.message : 'Unknown error'

    if (message.includes('Vision') || message.includes('CREDENTIALS')) {
      return res.status(500).json({
        success: false,
        error: `Google Cloud Vision エラー: ${message}`,
      })
    }

    if (message.includes('Bedrock') || message.includes('AccessDenied') || message.includes('UnrecognizedClient')) {
      return res.status(500).json({
        success: false,
        error: `AWS Bedrock エラー: ${message}`,
      })
    }

    return res.status(500).json({ success: false, error: message })
  }
}
