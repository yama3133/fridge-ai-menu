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

type ClaudeResponse = {
  ingredients: string[]
  menus: MenuItem[]
}

type AnalyzeResponse = {
  success: boolean
  ingredients?: string[]
  menus?: MenuItem[]
  error?: string
}

function parseClaudeResponse(text: string): ClaudeResponse {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1])
    }
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

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')

  try {
    // Step 1: Vision API でラベル・物体を全取得（フィルタなし）
    const visionClient = initializeVisionClient()

    const [labelResult, objectResult] = await Promise.all([
      visionClient.labelDetection({
        image: { content: base64Data },
        imageContext: { languageHints: ['ja', 'en'] },
      }),
      visionClient.objectLocalization!({
        image: { content: base64Data },
      }),
    ])

    const labels = (labelResult[0].labelAnnotations ?? [])
      .filter(l => (l.score ?? 0) > 0.5)
      .map(l => l.description ?? '')

    const objects = (objectResult[0].localizedObjectAnnotations ?? [])
      .filter(o => (o.score ?? 0) > 0.4)
      .map(o => o.name ?? '')

    const allLabels = Array.from(new Set([...labels, ...objects])).slice(0, 40)

    if (allLabels.length === 0) {
      return res.status(200).json({ success: true, ingredients: [], menus: [] })
    }

    // Step 2: Claude に「食材特定＋献立提案」を一括依頼
    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? 'ap-northeast-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    })

    const prompt = `あなたは料理の専門家です。
冷蔵庫の写真をAIで解析した結果、以下のラベルが検出されました：

検出ラベル: ${allLabels.join('、')}

【タスク1】上記ラベルから冷蔵庫に入っている食材・食品を日本語で特定してください。
- 生鮮食品、缶詰、冷凍食品、調味料、加工食品、飲み物など何でも含めてください
- Vision AIの認識誤りを考慮し、冷蔵庫によくある食品として合理的に解釈してください
- 最大15種類まで

【タスク2】特定した食材を使って作れる献立を3つ提案してください。

必ず以下のJSON形式のみで回答してください（他の文章は不要）：

{
  "ingredients": ["食材1", "食材2", "食材3"],
  "menus": [
    {
      "name": "料理名",
      "description": "料理の説明（50文字以内）",
      "ingredients": ["使用食材1", "使用食材2"],
      "cookingTime": "調理時間（例：20分）",
      "difficulty": "難易度（簡単/普通/難しい）"
    }
  ]
}`

    const command = new InvokeModelCommand({
      modelId: 'us.anthropic.claude-sonnet-4-5-20251101-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const bedrockResponse = await bedrockClient.send(command)
    const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body))
    const responseText = responseBody.content[0].text as string

    const { ingredients, menus } = parseClaudeResponse(responseText)

    return res.status(200).json({ success: true, ingredients, menus })
  } catch (err: unknown) {
    console.error('analyze-fridge error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'

    if (message.includes('PERMISSION_DENIED') || message.includes('billing')) {
      return res.status(500).json({
        success: false,
        error: `Google Cloud Vision エラー: 課金が有効になっていません。GCPコンソールで課金を有効にしてください。`,
      })
    }
    if (message.includes('CREDENTIALS') || message.includes('Vision')) {
      return res.status(500).json({
        success: false,
        error: `Google Cloud Vision エラー: ${message}`,
      })
    }
    if (message.includes('AccessDenied') || message.includes('UnrecognizedClient')) {
      return res.status(500).json({
        success: false,
        error: `AWS Bedrock エラー: ${message}`,
      })
    }

    return res.status(500).json({ success: false, error: message })
  }
}
