import { useState, useRef, useCallback, useEffect } from 'react'
import Head from 'next/head'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { useI18n, LangSelect } from '../lib/i18n'
import styles from '../styles/home.module.css'

type MenuItem = {
  name: string
  description: string
  ingredients: string[]
  cookingTime: string
  difficulty: string
  nutrition?: {
    calories: number
    protein_g: number
    fat_g: number
    carbs_g: number
    sodium_mg: number
    fiber_g: number
  }
}

export default function Home() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [ingredients, setIngredients] = useState<string[]>([])
  const [menus, setMenus] = useState<MenuItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [hasHealthGoal, setHasHealthGoal] = useState(false)
  const [loggedIdx, setLoggedIdx] = useState<Set<number>>(new Set())
  const [loggingIdx, setLoggingIdx] = useState<number | null>(null)
  const { status } = useSession()
  const { t, lang } = useI18n()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    setIsMobile(navigator.maxTouchPoints > 0)
  }, [])

  // 献立結果をsessionStorageから復元（記録/コーチ画面から戻っても消えないように）
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('fridgeResult')
      if (saved) {
        const d = JSON.parse(saved)
        if (Array.isArray(d.menus) && d.menus.length > 0) {
          setIngredients(d.ingredients ?? [])
          setMenus(d.menus ?? [])
          setHasHealthGoal(d.hasHealthGoal ?? false)
          if (Array.isArray(d.loggedIdx)) setLoggedIdx(new Set<number>(d.loggedIdx))
        }
      }
    } catch {
      // ignore
    }
  }, [])

  // 献立結果をsessionStorageに保存（画像は容量が大きいので除外）
  useEffect(() => {
    try {
      if (menus.length > 0) {
        sessionStorage.setItem(
          'fridgeResult',
          JSON.stringify({
            ingredients,
            menus,
            hasHealthGoal,
            loggedIdx: Array.from(loggedIdx),
          })
        )
      }
    } catch {
      // ignore（容量オーバー等）
    }
  }, [ingredients, menus, hasHealthGoal, loggedIdx])

  const reset = useCallback(() => {
    setSelectedImage(null)
    setIngredients([])
    setMenus([])
    setError(null)
    setHasHealthGoal(false)
    setLoggedIdx(new Set())
    try {
      sessionStorage.removeItem('fridgeResult')
    } catch {
      // ignore
    }
  }, [])

  const handleLogMeal = useCallback(async (menu: MenuItem, idx: number) => {
    if (status !== 'authenticated') {
      window.location.href = '/login'
      return
    }
    setLoggingIdx(idx)
    try {
      const res = await fetch('/api/meal-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuName: menu.name,
          description: menu.description,
          ingredients: menu.ingredients,
          nutrition: menu.nutrition,
        }),
      })
      if (!res.ok) throw new Error('failed')
      setLoggedIdx(prev => new Set(prev).add(idx))
    } catch {
      alert('記録に失敗しました')
    } finally {
      setLoggingIdx(null)
    }
  }, [status])

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
        body: JSON.stringify({ imageBase64, lang }),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error ?? t('home.analyzeFailed'))
      }

      setIngredients(data.ingredients ?? [])
      setMenus(data.menus ?? [])
      setHasHealthGoal(data.hasHealthGoal ?? false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('home.unexpectedError'))
    } finally {
      setLoading(false)
    }
  }, [lang, t])

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
      setError(t('home.cameraError'))
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
        <title>{t('home.title')}</title>
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
              <h1 className={styles.title}>{t('home.title')}</h1>
              <p className={styles.subtitle}>{t('home.subtitle')}</p>
            </div>
            <nav style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
              {status === 'authenticated' ? (
                <>
                  <Link href="/profile" style={{ color: '#fff', fontSize: 14 }}>{t('nav.goal')}</Link>
                  <Link href="/dashboard" style={{ color: '#fff', fontSize: 14 }}>{t('nav.record')}</Link>
                  <Link href="/coach" style={{ color: '#fff', fontSize: 14 }}>{t('nav.coach')}</Link>
                </>
              ) : (
                <Link href="/login" style={{ color: '#fff', fontSize: 14 }}>{t('common.login')}</Link>
              )}
              <LangSelect color="#fff" />
            </nav>
          </div>
        </header>

        <main className={styles.main}>
          {/* Upload Section */}
          <section className={styles.uploadSection}>
            {!isCameraActive && !selectedImage && (
              <div className={styles.uploadArea}>
                <div className={styles.uploadIcon}>📸</div>
                <p className={styles.uploadText}>
                  {t('home.uploadText')}
                </p>
                <div className={styles.uploadButtons}>
                  <button
                    className={styles.primaryBtn}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                  >
                    {t('home.choosePhoto')}
                  </button>
                  <button
                    className={styles.secondaryBtn}
                    onClick={startCamera}
                    disabled={loading}
                  >
                    {t('home.takePhoto')}
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
                    {t('home.capture')}
                  </button>
                  <button className={styles.resetBtn} onClick={stopCamera}>
                    {t('home.cancel')}
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
                    {t('home.chooseAnother')}
                  </button>
                )}
              </div>
            )}
          </section>

          {/* ローディング */}
          {loading && (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <p className={styles.loadingText} style={{ whiteSpace: 'pre-line' }}>{t('home.analyzing')}</p>
            </div>
          )}

          {/* エラー */}
          {error && <div className={styles.error}>{error}</div>}

          {/* 検出食材 */}
          {ingredients.length > 0 && (
            <section className={styles.ingredientsSection}>
              <h2 className={styles.sectionTitle}>{t('home.detected', { count: ingredients.length })}</h2>
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
                {t('home.menuTitle', { count: menus.length })}
              </h2>
              {hasHealthGoal && (
                <div className={styles.healthBadge}>{t('home.healthBadge')}</div>
              )}
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
                    {menu.nutrition && (
                      <div className={styles.nutrition}>
                        <span className={styles.nutritionItem}>🔥 {menu.nutrition.calories}kcal</span>
                        <span className={styles.nutritionItem}>🥩 P{menu.nutrition.protein_g}g</span>
                        <span className={styles.nutritionItem}>🧈 F{menu.nutrition.fat_g}g</span>
                        <span className={styles.nutritionItem}>🍚 C{menu.nutrition.carbs_g}g</span>
                        <span className={styles.nutritionItem}>🧂 {menu.nutrition.sodium_mg}mg</span>
                        <span className={styles.nutritionItem}>🌾 {menu.nutrition.fiber_g}g</span>
                      </div>
                    )}
                    <button
                      className={loggedIdx.has(idx) ? styles.logButtonDone : styles.logButton}
                      onClick={() => handleLogMeal(menu, idx)}
                      disabled={loggingIdx === idx || loggedIdx.has(idx)}
                    >
                      {loggedIdx.has(idx)
                        ? t('home.eaten')
                        : loggingIdx === idx
                          ? t('home.logging')
                          : t('home.eat')}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!loading && selectedImage && ingredients.length === 0 && menus.length === 0 && !error && (
            <div className={styles.error}>
              {t('home.noIngredients')}
            </div>
          )}
        </main>

        <footer className={styles.footer}>
          {t('home.footer')}
        </footer>
      </div>
    </>
  )
}
