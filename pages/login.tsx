import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function LoginPage() {
  const { status } = useSession()
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
      <h1 style={{ fontSize: 24, margin: 0 }}>冷蔵庫AI 健康管理</h1>
      <p style={{ color: '#666', maxWidth: 360, lineHeight: 1.7 }}>
        冷蔵庫の写真から、あなたの健康目標に合わせた献立を提案し、栄養を記録・管理します。
      </p>
      <button
        onClick={() => signIn('google', { callbackUrl: '/profile' })}
        style={{
          padding: '12px 24px',
          fontSize: 16,
          fontWeight: 600,
          color: '#fff',
          background: '#1a73e8',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        Googleでログイン
      </button>
    </main>
  )
}
