import type { NextApiRequest, NextApiResponse } from 'next'
import { validateVisionClientConfig } from '../../lib/gcp-auth'

type HealthResponse = {
  status: string
  timestamp: string
  services: {
    googleVision: { configured: boolean; message: string }
    awsBedrock: { configured: boolean; message: string }
  }
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthResponse>
) {
  const visionConfig = validateVisionClientConfig()

  const awsConfigured =
    Boolean(process.env.AWS_ACCESS_KEY_ID) &&
    Boolean(process.env.AWS_SECRET_ACCESS_KEY) &&
    Boolean(process.env.AWS_REGION)

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      googleVision: {
        configured: visionConfig.valid,
        message: visionConfig.message,
      },
      awsBedrock: {
        configured: awsConfigured,
        message: awsConfigured
          ? 'AWS Bedrock credentials are configured.'
          : 'AWS credentials not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION.',
      },
    },
  })
}
