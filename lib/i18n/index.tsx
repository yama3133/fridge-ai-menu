import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { messages, LANGS, type Lang } from './messages'

type TParams = Record<string, string | number>

type I18nContextType = {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, params?: TParams) => string
}

const I18nContext = createContext<I18nContextType>({
  lang: 'ja',
  setLang: () => {},
  t: (key) => key,
})

function format(str: string, params?: TParams): string {
  if (!params) return str
  return str.replace(/\{(\w+)\}/g, (_, k: string) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`
  )
}

const isLang = (v: string): v is Lang => LANGS.some((l) => l.code === v)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ja')

  // クライアントで保存済みの言語を復元（SSRは常にja → hydration一致）
  useEffect(() => {
    const saved = localStorage.getItem('lang')
    if (saved && isLang(saved)) setLangState(saved)
  }, [])

  const setLang = (l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem('lang', l)
    } catch {
      // ignore
    }
  }

  const t = (key: string, params?: TParams) =>
    format(messages[lang][key] ?? key, params)

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export const useI18n = () => useContext(I18nContext)

// 言語切替ドロップダウン
export function LangSelect({ color = '#333' }: { color?: string }) {
  const { lang, setLang } = useI18n()
  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      style={{
        background: 'transparent',
        border: `1px solid ${color}`,
        color,
        borderRadius: 6,
        padding: '3px 6px',
        fontSize: 12,
        cursor: 'pointer',
      }}
      aria-label="language"
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code} style={{ color: '#000' }}>
          {l.label}
        </option>
      ))}
    </select>
  )
}
