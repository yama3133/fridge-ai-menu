// デモ用: 過去N日分の食事記録を投入するスクリプト
//   使い方: node scripts/seed-meal-logs.mjs <email> [days]
//   例:     node scripts/seed-meal-logs.mjs you@example.com 10
import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.local' })

const email = process.argv[2]
const days = Number(process.argv[3] ?? 10)

if (!email) {
  console.error('使い方: node scripts/seed-meal-logs.mjs <email> [days]')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// 1食分の候補（栄養はおおよその概算）
const MEALS = [
  { name: '鶏むね肉とブロッコリーのソテー', ing: ['鶏むね肉', 'ブロッコリー', 'オリーブオイル'], n: [320, 38, 12, 8, 480, 4] },
  { name: '納豆ごはんと味噌汁', ing: ['納豆', 'ごはん', '味噌', 'わかめ'], n: [430, 18, 8, 70, 1200, 6] },
  { name: 'サバの塩焼き定食', ing: ['サバ', 'ごはん', '小松菜'], n: [560, 32, 24, 60, 1400, 5] },
  { name: '豆腐とわかめのスープ', ing: ['木綿豆腐', 'わかめ', 'ねぎ'], n: [150, 12, 8, 6, 700, 3] },
  { name: '野菜たっぷりサラダ', ing: ['レタス', 'トマト', 'きゅうり', 'ツナ'], n: [180, 10, 9, 12, 350, 5] },
  { name: '卵かけごはん', ing: ['卵', 'ごはん', '醤油'], n: [380, 14, 9, 62, 600, 1] },
  { name: '鮭おにぎり2個', ing: ['ごはん', '鮭', 'のり'], n: [400, 12, 4, 78, 900, 2] },
  { name: '高野豆腐の煮物', ing: ['高野豆腐', 'にんじん', 'しいたけ'], n: [220, 18, 10, 14, 800, 5] },
  { name: '鶏ささみと野菜の蒸し物', ing: ['ささみ', 'キャベツ', 'もやし'], n: [240, 30, 5, 12, 450, 6] },
  { name: 'きのこの炊き込みごはん', ing: ['ごはん', 'しめじ', 'えのき', '油揚げ'], n: [410, 12, 7, 76, 950, 7] },
]

const dateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

async function main() {
  const u = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email])
  if (u.rows.length === 0) {
    console.error(`ユーザーが見つかりません: ${email}`)
    process.exit(1)
  }
  const userId = u.rows[0].id

  const today = new Date()
  let inserted = 0
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const eaten = dateStr(d)
    // 1日 2〜3食
    const mealsPerDay = 2 + Math.floor(Math.random() * 2)
    for (let m = 0; m < mealsPerDay; m++) {
      const meal = pick(MEALS)
      const [cal, p, f, c, sodium, fiber] = meal.n
      await pool.query(
        `INSERT INTO meal_logs
          (user_id, menu_name, description, ingredients, calories, protein_g, fat_g, carbs_g, sodium_mg, fiber_g, eaten_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          userId,
          meal.name,
          'デモ用シードデータ',
          JSON.stringify(meal.ing),
          cal, p, f, c, sodium, fiber,
          eaten,
        ]
      )
      inserted++
    }
  }
  console.log(`投入完了: ${inserted}件（${days}日分） user=${email}`)
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
