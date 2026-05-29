import { useSession, signIn, signOut } from 'next-auth/react'
import { useEffect, useState } from 'react'

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

// API値(number|null) → フォーム文字列
function toFormValue(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

export default function ProfilePage() {
  const { data: session, status } = useSession()
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
      .catch(() => setMessage('プロフィールの読み込みに失敗しました'))
  }, [status])

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
      setMessage('保存しました')
    } catch {
      setMessage('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') {
    return <main style={wrap}>読み込み中...</main>
  }

  if (status === 'unauthenticated') {
    return (
      <main style={wrap}>
        <p>ログインが必要です。</p>
        <button style={primaryBtn} onClick={() => signIn('google', { callbackUrl: '/profile' })}>
          Googleでログイン
        </button>
      </main>
    )
  }

  return (
    <main style={{ ...wrap, alignItems: 'stretch', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>健康目標プロフィール</h1>
        <button style={linkBtn} onClick={() => signOut({ callbackUrl: '/login' })}>
          ログアウト
        </button>
      </div>
      <p style={{ color: '#666', margin: '4px 0 16px' }}>
        {session?.user?.email} としてログイン中
      </p>

      <Field label="年齢">
        <input style={input} type="number" value={form.age} onChange={(e) => update('age', e.target.value)} />
      </Field>

      <Field label="性別">
        <select style={input} value={form.sex} onChange={(e) => update('sex', e.target.value)}>
          <option value="">未選択</option>
          <option value="male">男性</option>
          <option value="female">女性</option>
          <option value="other">その他</option>
        </select>
      </Field>

      <Field label="活動量">
        <select style={input} value={form.activityLevel} onChange={(e) => update('activityLevel', e.target.value)}>
          <option value="">未選択</option>
          <option value="low">低い（座り仕事中心）</option>
          <option value="moderate">普通</option>
          <option value="high">高い（運動習慣あり）</option>
        </select>
      </Field>

      <Field label="目標カロリー（kcal/日）">
        <input style={input} type="number" value={form.targetCalories} onChange={(e) => update('targetCalories', e.target.value)} />
      </Field>

      <Field label="目標タンパク質（g/日）">
        <input style={input} type="number" value={form.targetProteinG} onChange={(e) => update('targetProteinG', e.target.value)} />
      </Field>

      <Field label="塩分上限（mg/日）">
        <input style={input} type="number" value={form.targetSodiumMg} onChange={(e) => update('targetSodiumMg', e.target.value)} />
      </Field>

      <Field label="食物繊維 目標（g/日）">
        <input style={input} type="number" value={form.targetFiberG} onChange={(e) => update('targetFiberG', e.target.value)} />
      </Field>

      <Field label="目標タイプ">
        <select style={input} value={form.goal} onChange={(e) => update('goal', e.target.value)}>
          <option value="">未選択</option>
          <option value="diet">ダイエット</option>
          <option value="muscle">筋肉増量</option>
          <option value="maintain">現状維持</option>
        </select>
      </Field>

      <button style={{ ...primaryBtn, marginTop: 8 }} onClick={save} disabled={saving}>
        {saving ? '保存中...' : '保存する'}
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
