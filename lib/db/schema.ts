import {
  pgTable,
  text,
  integer,
  numeric,
  timestamp,
  date,
  jsonb,
  primaryKey,
  uuid,
} from 'drizzle-orm/pg-core'

// ============================================================
// Auth.js (NextAuth) 標準テーブル
//   @auth/drizzle-adapter のスキーマに準拠
// ============================================================

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
)

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
)

// ============================================================
// アプリ独自テーブル
// ============================================================

// 健康目標プロフィール（1ユーザー1件）
export const healthProfiles = pgTable('health_profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  age: integer('age'),
  sex: text('sex'), // male / female / other
  activityLevel: text('activity_level'), // low / moderate / high
  targetCalories: integer('target_calories'), // 1日の目標kcal
  targetProteinG: integer('target_protein_g'), // 1日の目標タンパク質(g)
  targetSodiumMg: integer('target_sodium_mg'), // 1日の塩分上限(mg)
  targetFiberG: integer('target_fiber_g'), // 1日の食物繊維目標(g)
  goal: text('goal'), // diet / muscle / maintain
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// 献立記録（「食べた」と記録した単位）
export const mealLogs = pgTable('meal_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  menuName: text('menu_name').notNull(),
  description: text('description'),
  ingredients: jsonb('ingredients').$type<string[]>(),
  calories: numeric('calories'),
  proteinG: numeric('protein_g'),
  fatG: numeric('fat_g'),
  carbsG: numeric('carbs_g'),
  sodiumMg: numeric('sodium_mg'), // 塩分(mg)
  fiberG: numeric('fiber_g'), // 食物繊維(g)
  eatenAt: date('eaten_at').notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// AIヘルスコーチの週次アドバイス履歴
export const coachAdvices = pgTable('coach_advices', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  summary: jsonb('summary'), // 集計スナップショット（平均PFC・塩分・繊維、達成率）
  advice: text('advice').notNull(), // Claudeが生成したアドバイス本文
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})
