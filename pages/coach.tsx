import { useSession, signIn } from 'next-auth/react'
import { useState } from 'react'
import Link from 'next/link'
import { useI18n, LangSelect } from '../lib/i18n'

type Advice = {
  summaryText: string
  achievements: string[]
  shortfalls: string[]
  tomorrow: string[]
}

type Summary = {
  recordedDays: number
  mealCount: number
  dailyAverage: { kcal: number }
}

export default function CoachPage() {
  const { status } = useSession()
  const { t, lang } = useI18n()
  const [loading, setLoading] = useState(false)
  const [advice, setAdvice] = useState<Advice | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [noData, setNoData] = useState(false)
  const [error, setError] = useState('')

  const generate = async () => {
    setLoading(true)
    setError('')
    setNoData(false)
    setAdvice(null)
    try {
      const res = await fetch(`/api/coach/weekly?lang=${lang}`)
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      if (!data.hasData) {
        setNoData(true)
      } else {
        setAdvice(data.advice)
        setSummary(data.summary)
      }
    } catch {
      setError(t('coach.failed'))
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading') {
    return <main style={wrap}>{t('common.loading')}</main>
  }
  if (status === 'unauthenticated') {
    return (
      <main style={wrap}>
        <p>{t('common.loginRequired')}</p>
        <button style={primaryBtn} onClick={() => signIn('google', { callbackUrl: '/coach' })}>
          {t('common.loginWithGoogle')}
        </button>
      </main>
    )
  }

  return (
    <main style={{ ...wrap, alignItems: 'stretch', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>{t('coach.title')}</h1>
        <nav style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 14 }}>
          <Link href="/">{t('nav.menu')}</Link>
          <Link href="/dashboard">{t('nav.record')}</Link>
          <LangSelect />
        </nav>
      </div>
      <p style={{ color: '#666', marginTop: 0 }}>{t('coach.subtitle')}</p>

      <button style={primaryBtn} onClick={generate} disabled={loading}>
        {loading ? t('coach.generating') : t('coach.generate')}
      </button>

      {error && <p style={{ color: '#ef4444' }}>{error}</p>}
      {noData && (
        <p style={{ color: '#b45309', background: '#fffbeb', padding: 12, borderRadius: 8 }}>
          {t('coach.noData')}
        </p>
      )}

      {summary && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Stat label={t('coach.statDays')} value={`${summary.recordedDays}`} />
          <Stat label={t('coach.statMeals')} value={`${summary.mealCount}`} />
          <Stat label={t('coach.statAvgKcal')} value={`${summary.dailyAverage.kcal}`} />
        </div>
      )}

      {advice && (
        <>
          <section style={{ ...card, background: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <h2 style={h2}>{t('coach.summary')}</h2>
            <p style={{ margin: 0, lineHeight: 1.7 }}>{advice.summaryText}</p>
          </section>
          <AdviceList title={t('coach.achievements')} items={advice.achievements} />
          <AdviceList title={t('coach.shortfalls')} items={advice.shortfalls} />
          <AdviceList title={t('coach.tomorrow')} items={advice.tomorrow} highlight />
        </>
      )}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: '1 1 auto', minWidth: 120, ...card, padding: 14, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function AdviceList({ title, items, highlight = false }: { title: string; items: string[]; highlight?: boolean }) {
  if (!items?.length) return null
  return (
    <section style={{ ...card, ...(highlight ? { background: '#eff6ff', borderColor: '#bfdbfe' } : {}) }}>
      <h2 style={h2}>{title}</h2>
      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </section>
  )
}

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-start',
  gap: 14,
  padding: 24,
}

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #eee',
  borderRadius: 12,
  padding: 18,
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
}

const h2: React.CSSProperties = {
  fontSize: 15,
  margin: '0 0 10px',
  color: '#333',
}

const primaryBtn: React.CSSProperties = {
  padding: '12px 24px',
  fontSize: 16,
  fontWeight: 600,
  color: '#fff',
  background: '#16a34a',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
}
