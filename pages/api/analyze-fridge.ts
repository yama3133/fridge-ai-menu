import type { NextApiRequest, NextApiResponse } from 'next'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'

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

type ClaudeResult = {
  ingredients: string[]
  menus: MenuItem[]
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

  // data URL からメディアタイプと純粋なbase64を分離
  const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/)
  const mediaType = (match?.[1] ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  const base64Data = match?.[2] ?? imageBase64

  try {
    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    })

    const prompt = `この冷蔵庫の写真を注意深く見てください。

【絶対ルール】
1. ラベルや形状から「明確に」識別できるものだけをリストアップしてください
2. 少しでも不確かなものは含めないでください
3. 「日本の冷蔵庫によくある食品」などの推測・補完は禁止です
4. ラベルが読めない場合は「読めない瓶」「不明な缶」など形状のみで記述し、中身を推測しないでください
5. 見えていないものは絶対に含めないでください

良い例：「みかん缶（ラベルにみかんと書いてある）」「赤いキャップのボトル（ラベル不明）」
悪い例：「いちご（推測）」「マヨネーズ（形から判断）」

以下のJSON形式のみで回答してください：

{
  "ingredients": ["明確に確認できる食材・食品のみ"],
  "menus": [
    {
      "name": "料理名",
      "description": "料理の説明（40文字以内）",
      "ingredients": ["使用する食材"],
      "cookingTime": "調理時間（例：20分）",
      "difficulty": "難易度（簡単/普通/難しい）"
    }
  ]
}

ingredientsは確実に見えるものだけ（不明なら空配列でも可）。
menusはingredients内の食材だけを使った献立を最大3つ。食材が少なすぎる場合は献立数を減らしても構いません。`

    const command = new InvokeModelCommand({
      modelId: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    })

    const response = await bedrockClient.send(command)
    const body = JSON.parse(new TextDecoder().decode(response.body))
    const text = body.content[0].text as string
    const { ingredients, menus } = parseClaudeResponse(text)

    return res.status(200).json({ success: true, ingredients, menus })
  } catch (err: unknown) {
    console.error('analyze-fridge error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ success: false, error: message })
  }
}
