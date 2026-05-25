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

  const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/)
  const mediaType = (match?.[1] ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  const base64Data = match?.[2] ?? imageBase64

  try {
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

    const prompt = `冷蔵庫の写真を分析してください。

${ocrSection}

【指示】
1. OCRテキストを最優先で使用し、ラベルに書いてある商品名・食材名を特定してください
2. 例：「ブルーベリー ジャム」と書いてあればジャム、「いちご ジャム」と書いてあればジャム
3. テキストが読めない商品は「不明な容器」など形状のみで記述し、中身を推測しない
4. 見た目の形状・色だけで食品を判断しない（丸い容器→アイスなど禁止）

以下のJSON形式のみで回答してください：

{
  "ingredients": ["特定できた食材・食品名（日本語）"],
  "menus": [
    {
      "name": "料理名",
      "description": "料理の説明（40文字以内）",
      "ingredients": ["使用する食材"],
      "cookingTime": "調理時間（例：20分）",
      "difficulty": "難易度（簡単/普通/難しい）"
    }
  ]
}`

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

    return res.status(200).json({ success: true, ingredients, menus })
  } catch (err: unknown) {
    console.error('analyze-fridge error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ success: false, error: message })
  }
}
