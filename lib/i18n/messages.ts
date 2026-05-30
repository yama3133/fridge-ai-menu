import ja, { type MessageKey } from './locales/ja'
import en from './locales/en'
import zh from './locales/zh'
import ko from './locales/ko'
import fr from './locales/fr'
import es from './locales/es'
import pt from './locales/pt'

export type Lang = 'ja' | 'en' | 'zh' | 'ko' | 'fr' | 'es' | 'pt'
export type { MessageKey }

// 各ロケールは Record<MessageKey,string>（キー網羅は各ファイルでtsc検証）
export const messages: Record<Lang, Record<string, string>> = {
  ja,
  en,
  zh,
  ko,
  fr,
  es,
  pt,
}

// 言語ドロップダウン用のリスト（コード + 表示ラベル）
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
]
