import { useState, useRef, useCallback, useEffect } from 'react'
import Head from 'next/head'
import styles from '../styles/home.module.css'

type MenuItem = {
  name: string
  description: string
  ingredients: string[]
  cookingTime: string
  difficulty: string
}

export default function Home() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ingredients, setIngredients] = useState<string[]>([])
  const [menus, setMenus] = useState<MenuItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    setIsMobile(navigator.maxTouchPoints > 0)
  }, [])

  const reset = useCallback(() => {
    setSelectedImage(null)
    setIngredients([])
    setMenus([])
    setError(null)
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setIsCameraActive(false)
  }, [])

  const analyzeImage = useCallback(async (imageBase64: string) => {
    setLoading(true)
    setError(null)
    setIngredients([])
    setMenus([])

    try {
      const response = await fetch('/api/analyze-fridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error ?? '解析に失敗しました')
      }

      setIngredients(data.ingredients ?? [])
      setMenus(data.menus ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : '予期しないエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleFileSelect = useCallback((file: File) => {
    stopCamera()
    reset()
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      setSelectedImage(base64)
      analyzeImage(base64)
    }
    reader.readAsDataURL(file)
  }, [analyzeImage, reset, stopCamera])

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
  }, [handleFileSelect])

  const startCamera = useCallback(async () => {
    // モバイルはネイティブカメラを使用
    if (isMobile) {
      cameraInputRef.current?.click()
      return
    }
    try {
      reset()
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      })
      streamRef.current = stream
      setIsCameraActive(true)
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      }, 50)
    } catch {
      setError('カメラへのアクセスに失敗しました。ブラウザの設定を確認してください。')
    }
  }, [isMobile, reset])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    setSelectedImage(dataUrl)
    stopCamera()
    analyzeImage(dataUrl)
  }, [analyzeImage, stopCamera])

  return (
    <>
      <Head>
        <title>冷蔵庫AI献立</title>
        <meta name="description" content="冷蔵庫の写真から食材を認識してAIが献立を提案します" />
        {/* viewport-fit=cover でノッチ・Dynamic Island対応 */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#16a34a" />
      </Head>

      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <div>
              <h1 className={styles.title}>🧊 冷蔵庫AI献立</h1>
              <p className={styles.subtitle}>写真を撮るだけで献立を自動提案</p>
            </div>
          </div>
        </header>

        <main className={styles.main}>
          {/* Upload Section */}
          <section className={styles.uploadSection}>
            {!isCameraActive && !selectedImage && (
              <div className={styles.uploadArea}>
                <div className={styles.uploadIcon}>📸</div>
                <p className={styles.uploadText}>
                  冷蔵庫の写真を選ぶか、カメラで撮影してください
                </p>
                <div className={styles.uploadButtons}>
                  <button
                    className={styles.primaryBtn}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                  >
                    🖼️ 写真を選ぶ
                  </button>
                  <button
                    className={styles.secondaryBtn}
                    onClick={startCamera}
                    disabled={loading}
                  >
                    📷 カメラで撮影
                  </button>
                </div>

                {/* 通常のファイル選択（フォトライブラリ） */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleImageUpload}
                />
                {/* iOS用ネイティブカメラ直接起動 */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={handleImageUpload}
                />
              </div>
            )}

            {/* デスクトップカメラプレビュー */}
            {isCameraActive && (
              <div>
                <div className={styles.cameraSection}>
                  <video
                    ref={videoRef}
                    className={styles.video}
                    autoPlay
                    playsInline
                    muted
                  />
                </div>
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <div className={styles.cameraActions}>
                  <button className={styles.captureBtn} onClick={capturePhoto}>
                    📸 撮影する
                  </button>
                  <button className={styles.resetBtn} onClick={stopCamera}>
                    キャンセル
                  </button>
                </div>
              </div>
            )}

            {/* 画像プレビュー */}
            {selectedImage && (
              <div className={styles.imagePreview}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedImage}
                  alt="選択した画像"
                  className={styles.previewImage}
                />
                {!loading && (
                  <button className={styles.resetBtn} onClick={() => {
                    reset()
                    if (fileInputRef.current) fileInputRef.current.value = ''
                    if (cameraInputRef.current) cameraInputRef.current.value = ''
                  }}>
                    別の画像を選ぶ
                  </button>
                )}
              </div>
            )}
          </section>

          {/* ローディング */}
          {loading && (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <p className={styles.loadingText}>AIが食材を認識して{'\n'}献立を考えています...</p>
            </div>
          )}

          {/* エラー */}
          {error && <div className={styles.error}>{error}</div>}

          {/* 検出食材 */}
          {ingredients.length > 0 && (
            <section className={styles.ingredientsSection}>
              <h2 className={styles.sectionTitle}>検出された食材 {ingredients.length}種類</h2>
              <div className={styles.ingredientsList}>
                {ingredients.map(ing => (
                  <span key={ing} className={styles.ingredientTag}>{ing}</span>
                ))}
              </div>
            </section>
          )}

          {/* 献立提案 */}
          {menus.length > 0 && (
            <section className={styles.menusSection}>
              <h2 className={styles.sectionTitle} style={{ marginBottom: '12px' }}>
                AI献立提案 {menus.length}品
              </h2>
              <div className={styles.menuGrid}>
                {menus.map((menu, idx) => (
                  <div key={idx} className={styles.menuCard}>
                    <div className={styles.menuHeader}>
                      <h3 className={styles.menuName}>{menu.name}</h3>
                      <span className={styles.difficulty} data-level={menu.difficulty}>
                        {menu.difficulty}
                      </span>
                    </div>
                    <p className={styles.menuDescription}>{menu.description}</p>
                    <div className={styles.menuMeta}>
                      <span className={styles.metaIcon}>⏱</span>
                      <span>{menu.cookingTime}</span>
                    </div>
                    {menu.ingredients?.length > 0 && (
                      <div className={styles.usedIngredients}>
                        {menu.ingredients.map(ing => (
                          <span key={ing} className={styles.smallTag}>{ing}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {!loading && selectedImage && ingredients.length === 0 && menus.length === 0 && !error && (
            <div className={styles.error}>
              食材が検出されませんでした。冷蔵庫の中身が写った写真を使ってください。
            </div>
          )}
        </main>

        <footer className={styles.footer}>
          Powered by Google Cloud Vision + AWS Bedrock (Claude Sonnet 4.5)
        </footer>
      </div>
    </>
  )
}
