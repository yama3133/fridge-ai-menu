import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useI18n, LangSelect } from '../lib/i18n'

export default function LoginPage() {
  const { status } = useSession()
  const { t } = useI18n()
  const router = useRouter()

  // ログイン済みならプロフィールへ
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/profile')
    }
  }, [status, router])

  return (
    <main
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <LangSelect />
      </div>
      <h1 style={{ fontSize: 24, margin: 0 }}>{t('login.appName')}</h1>
      <p style={{ color: '#666', maxWidth: 360, lineHeight: 1.7 }}>{t('login.desc')}</p>
      <button
        onClick={() => signIn('google', { callbackUrl: '/profile' })}
        style={{
          padding: '12px 24px',
          fontSize: 16,
          fontWeight: 600,
          color: '#fff',
          background: '#2563eb',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        {t('common.loginWithGoogle')}
      </button>
    </main>
  )
}
