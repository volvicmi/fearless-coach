import { MAX_GAMES } from '#shared/draft'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const name = String(body?.name ?? '').trim()
  const opponent = String(body?.opponent ?? '').trim()
  const { format, fearless, ourSide } = body ?? {}

  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })
  if (!(format in MAX_GAMES)) throw createError({ statusCode: 400, statusMessage: 'invalid format' })
  if (!['hard', 'off'].includes(fearless)) throw createError({ statusCode: 400, statusMessage: 'invalid fearless mode' })
  if (!['blue', 'red'].includes(ourSide)) throw createError({ statusCode: 400, statusMessage: 'invalid side' })

  const db = useDb()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO series (name, opponent, format, fearless) VALUES (?, ?, ?, ?)')
    .run(name, opponent, format, fearless)
  db.prepare('INSERT INTO games (series_id, n, our_side) VALUES (?, 1, ?)').run(lastInsertRowid, ourSide)

  return { id: Number(lastInsertRowid) }
})
