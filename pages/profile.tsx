import { useSession, signIn, signOut } from 'next-auth/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useI18n, LangSelect } from '../lib/i18n'

type ProfileForm = {
  age: string
  sex: string
  activityLevel: string
  targetCalories: string
  targetProteinG: string
  targetSodiumMg: string
  targetFiberG: string
  goal: string
}

const EMPTY_FORM: ProfileForm = {
  age: '',
  sex: '',
  activityLevel: '',
  targetCalories: '',
  targetProteinG: '',
  targetSodiumMg: '',
  targetFiberG: '',
  goal: '',
}

function toFormValue(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

export default function ProfilePage() {
  const { data: session, status } = useSession()
  const { t } = useI18n()
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/profile')
      .then((r) => r.json())
      .then((d) => {
        if (d.profile) {
          setForm({
            age: toFormValue(d.profile.age),
            sex: toFormValue(d.profile.sex),
            activityLevel: toFormValue(d.profile.activityLevel),
            targetCalories: toFormValue(d.profile.targetCalories),
            targetProteinG: toFormValue(d.profile.targetProteinG),
            targetSodiumMg: toFormValue(d.profile.targetSodiumMg),
            targetFiberG: toFormValue(d.profile.targetFiberG),
            goal: toFormValue(d.profile.goal),
          })
        }
      })
      .catch(() => setMessage(t('profile.loadFailed')))
  }, [status, t])

  const update = (key: keyof ProfileForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('save failed')
      setMessage(t('profile.saved'))
    } catch {
      setMessage(t('profile.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') {
    return <main style={wrap}>{t('common.loading')}</main>
  }

  if (status === 'unauthenticated') {
    return (
      <main style={wrap}>
        <p>{t('common.loginRequired')}</p>
        <button style={primaryBtn} onClick={() => signIn('google', { callbackUrl: '/profile' })}>
          {t('common.loginWithGoogle')}
        </button>
      </main>
    )
  }

  return (
    <main style={{ ...wrap, alignItems: 'stretch', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>{t('profile.title')}</h1>
        <nav style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 14 }}>
          <Link href="/">{t('nav.menu')}</Link>
          <Link href="/dashboard">{t('nav.record')}</Link>
          <button style={linkBtn} onClick={() => signOut({ callbackUrl: '/login' })}>
            {t('common.logout')}
          </button>
          <LangSelect />
        </nav>
      </div>
      <p style={{ color: '#666', margin: '4px 0 16px' }}>
        {t('profile.loggedInAs', { email: session?.user?.email ?? '' })}
      </p>

      <Field label={t('profile.age')}>
        <input style={input} type="number" value={form.age} onChange={(e) => update('age', e.target.value)} />
      </Field>

      <Field label={t('profile.sex')}>
        <select style={input} value={form.sex} onChange={(e) => update('sex', e.target.value)}>
          <option value="">{t('opt.unset')}</option>
          <option value="male">{t('opt.male')}</option>
          <option value="female">{t('opt.female')}</option>
          <option value="other">{t('opt.other')}</option>
        </select>
      </Field>

      <Field label={t('profile.activity')}>
        <select style={input} value={form.activityLevel} onChange={(e) => update('activityLevel', e.target.value)}>
          <option value="">{t('opt.unset')}</option>
          <option value="low">{t('opt.actLow')}</option>
          <option value="moderate">{t('opt.actMod')}</option>
          <option value="high">{t('opt.actHigh')}</option>
        </select>
      </Field>

      <Field label={t('profile.targetCalories')}>
        <input style={input} type="number" value={form.targetCalories} onChange={(e) => update('targetCalories', e.target.value)} />
      </Field>

      <Field label={t('profile.targetProtein')}>
        <input style={input} type="number" value={form.targetProteinG} onChange={(e) => update('targetProteinG', e.target.value)} />
      </Field>

      <Field label={t('profile.targetSodium')}>
        <input style={input} type="number" value={form.targetSodiumMg} onChange={(e) => update('targetSodiumMg', e.target.value)} />
      </Field>

      <Field label={t('profile.targetFiber')}>
        <input style={input} type="number" value={form.targetFiberG} onChange={(e) => update('targetFiberG', e.target.value)} />
      </Field>

      <Field label={t('profile.goal')}>
        <select style={input} value={form.goal} onChange={(e) => update('goal', e.target.value)}>
          <option value="">{t('opt.unset')}</option>
          <option value="diet">{t('opt.goalDiet')}</option>
          <option value="muscle">{t('opt.goalMuscle')}</option>
          <option value="maintain">{t('opt.goalMaintain')}</option>
        </select>
      </Field>

      <button style={{ ...primaryBtn, marginTop: 8 }} onClick={save} disabled={saving}>
        {saving ? t('common.saving') : t('common.save')}
      </button>
      {message && <p style={{ textAlign: 'center', color: '#1a73e8' }}>{message}</p>}
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
      <span style={{ fontSize: 13, color: '#444' }}>{label}</span>
      {children}
    </label>
  )
}

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 12,
  padding: 24,
}

const input: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 16,
  border: '1px solid #ccc',
  borderRadius: 8,
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

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#888',
  fontSize: 13,
  cursor: 'pointer',
  textDecoration: 'underline',
}
