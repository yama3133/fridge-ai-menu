import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  /**
   * session.user に DB のユーザーID(id) を追加
   */
  interface Session {
    user: {
      id: string
    } & DefaultSession['user']
  }
}
