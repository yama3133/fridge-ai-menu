import { useSession, signIn } from 'next-auth/react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts'
import { useI18n, LangSelect } from '../lib/i18n'

type MealLog = {
  id: string
  eatenAt: string
  menuName: string
  calories: string | null
  proteinG: string | null
  fatG: string | null
  carbsG: string | null
  sodiumMg: string | null
  fiberG: string | null
}

type Profile = {
  targetCalories: number | null
  targetProteinG: number | null
  targetSodiumMg: number | null
  targetFiberG: number | null
} | null

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function DashboardPage() {
  const { status } = useSession()
  const { t } = useI18n()
  const [logs, setLogs] = useState<MealLog[]>([])
  const [profile, setProfile] = useState<Profile>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (status !== 'authenticated') return
    Promise.all([
      fetch('/api/meal-logs?range=week').then((r) => r.json()),
      fetch('/api/profile').then((r) => r.json()),
    ])
      .then(([m, p]) => {
        setLogs(m.mealLogs ?? [])
        setProfile(p.profile ?? null)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [status])

  if (status === 'loading') {
    return <main style={wrap}>{t('common.loading')}</main>
  }
  if (status === 'unauthenticated') {
    return (
      <main style={wrap}>
        <p>{t('common.loginRequired')}</p>
        <button style={primaryBtn} onClick={() => signIn('google', { callbackUrl: '/dashboard' })}>
          {t('common.loginWithGoogle')}
        </button>
      </main>
    )
  }

  const today = new Date()
  const todayK = dateKey(today)
  const days: { key: string; label: string }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    days.push({ key: dateKey(d), label: `${d.getMonth() + 1}/${d.getDate()}` })
  }

  const sumByDate: Record<string, { kcal: number; p: number; f: number; c: number; sodium: number; fiber: number }> = {}
  days.forEach((d) => {
    sumByDate[d.key] = { kcal: 0, p: 0, f: 0, c: 0, sodium: 0, fiber: 0 }
  })
  logs.forEach((l) => {
    const s = sumByDate[l.eatenAt]
    if (!s) return
    s.kcal += num(l.calories)
    s.p += num(l.proteinG)
    s.f += num(l.fatG)
    s.c += num(l.carbsG)
    s.sodium += num(l.sodiumMg)
    s.fiber += num(l.fiberG)
  })

  const chartData = days.map((d) => ({
    name: d.label,
    kcal: Math.round(sumByDate[d.key].kcal),
  }))

  const tot = sumByDate[todayK] ?? { kcal: 0, p: 0, f: 0, c: 0, sodium: 0, fiber: 0 }
  const todayCount = logs.filter((l) => l.eatenAt === todayK).length

  return (
    <main style={{ ...wrap, alignItems: 'stretch', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>{t('dash.title')}</h1>
        <nav style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 14 }}>
          <Link href="/">{t('nav.menu')}</Link>
          <Link href="/profile">{t('nav.goal')}</Link>
          <Link href="/coach">{t('nav.coach')}</Link>
          <LangSelect />
        </nav>
      </div>

      {!profile && (
        <p style={{ color: '#b45309', background: '#fffbeb', padding: 12, borderRadius: 8 }}>
          {t('dash.noProfile')}
        </p>
      )}

      {/* 今日のサマリー */}
      <section style={card}>
        <h2 style={h2}>{t('dash.todayIntake', { count: todayCount })}</h2>
        <ProgressRow label={t('dash.calories')} value={tot.kcal} target={profile?.targetCalories ?? null} unit="kcal" overIsBad />
        <ProgressRow label={t('dash.protein')} value={tot.p} target={profile?.targetProteinG ?? null} unit="g" />
        <ProgressRow label={t('dash.sodium')} value={tot.sodium} target={profile?.targetSodiumMg ?? null} unit="mg" overIsBad />
        <ProgressRow label={t('dash.fiber')} value={tot.fiber} target={profile?.targetFiberG ?? null} unit="g" />
      </section>

      {/* 週次グラフ */}
      <section style={card}>
        <h2 style={h2}>{t('dash.weekTrend')}</h2>
        {loaded && logs.length === 0 ? (
          <p style={{ color: '#888' }}>{t('dash.noRecords')}</p>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                {profile?.targetCalories != null && (
                  <ReferenceLine
                    y={profile.targetCalories}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={{ value: t('dash.targetKcal'), fontSize: 11, fill: '#ef4444', position: 'insideTopRight' }}
                  />
                )}
                <Bar dataKey="kcal" name="kcal" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </main>
  )
}

function ProgressRow({
  label,
  value,
  target,
  unit,
  overIsBad = false,
}: {
  label: string
  value: number
  target: number | null
  unit: string
  overIsBad?: boolean
}) {
  const { t } = useI18n()
  const v = Math.round(value)
  const pct = target && target > 0 ? Math.min((v / target) * 100, 100) : 0
  const over = target != null && v > target
  const barColor = over ? (overIsBad ? '#ef4444' : '#16a34a') : '#16a34a'

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: '#555' }}>
          {v}
          {target != null ? ` / ${target}` : ''} {unit}
          {target != null && (
            <span style={{ marginLeft: 8, color: over ? (overIsBad ? '#ef4444' : '#16a34a') : '#888' }}>
              {overIsBad
                ? over
                  ? t('dash.over', { n: v - target })
                  : t('dash.remaining', { n: target - v })
                : over
                  ? t('dash.achieved')
                  : t('dash.remaining', { n: target - v })}
            </span>
          )}
        </span>
      </div>
      <div style={{ height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor, transition: 'width .3s' }} />
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-start',
  gap: 12,
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
  margin: '0 0 14px',
  color: '#333',
}

const primaryBtn: React.CSSProperties = {
  padding: '12px 24px',
  fontSize: 16,
  fontWeight: 600,
  color: '#fff',
  background: '#1a73e8',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
}
