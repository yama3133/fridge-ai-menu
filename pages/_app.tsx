import type { AppProps } from 'next/app'
import { SessionProvider } from 'next-auth/react'
import { I18nProvider } from '../lib/i18n'
import '../styles/globals.css'

export default function App({
  Component,
  pageProps: { session, ...pageProps },
}: AppProps) {
  return (
    <SessionProvider session={session}>
      <I18nProvider>
        <Component {...pageProps} />
      </I18nProvider>
    </SessionProvider>
  )
}
