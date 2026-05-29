import NextAuth, { type NextAuthOptions } from 'next-auth'
import type { Adapter } from 'next-auth/adapters'
import GoogleProvider from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/lib/db'
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from '@/lib/db/schema'

export const authOptions: NextAuthOptions = {
  // M1 で定義した Drizzle テーブルを Auth.js に接続
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ],
  // DBセッション戦略（sessions テーブルを使用）
  session: { strategy: 'database' },
  callbacks: {
    // クライアントの session.user.id で DB のユーザーIDを参照できるようにする
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
}

export default NextAuth(authOptions)
