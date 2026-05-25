import { ImageAnnotatorClient } from '@google-cloud/vision'

export function initializeVisionClient(): ImageAnnotatorClient {
  const credentialsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS

  if (credentialsBase64) {
    const credentials = JSON.parse(
      Buffer.from(credentialsBase64, 'base64').toString('utf-8')
    )
    return new ImageAnnotatorClient({ credentials })
  }

  if (credentialsPath) {
    return new ImageAnnotatorClient({ keyFilename: credentialsPath })
  }

  // Fall back to ADC (Application Default Credentials)
  return new ImageAnnotatorClient()
}

export function validateVisionClientConfig(): { valid: boolean; message: string } {
  const hasBase64 = Boolean(process.env.GOOGLE_CREDENTIALS_BASE64)
  const hasKeyFile = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  const hasProject = Boolean(process.env.GOOGLE_CLOUD_PROJECT)

  if (!hasBase64 && !hasKeyFile) {
    return {
      valid: false,
      message: 'Google Cloud credentials not configured. Set GOOGLE_CREDENTIALS_BASE64 or GOOGLE_APPLICATION_CREDENTIALS.',
    }
  }

  if (!hasProject) {
    return {
      valid: false,
      message: 'GOOGLE_CLOUD_PROJECT environment variable is not set.',
    }
  }

  return { valid: true, message: 'Vision client configuration is valid.' }
}
