import { MAX_GAMES } from '#shared/draft'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const name = String(body?.name ?? '').trim()
  const opponent = String(body?.opponent ?? '').trim()
  const { format, fearless, ourSide } = body ?? {}

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Le nom est obligatoire' })
  if (!(format in MAX_GAMES)) throw createError({ statusCode: 400, statusMessage: 'Format invalide' })
  if (!['hard', 'off'].includes(fearless)) throw createError({ statusCode: 400, statusMessage: 'Mode Fearless invalide' })
  if (!['blue', 'red'].includes(ourSide)) throw createError({ statusCode: 400, statusMessage: 'Côté invalide' })

  const db = useDb()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO series (name, opponent, format, fearless) VALUES (?, ?, ?, ?)')
    .run(name, opponent, format, fearless)
  db.prepare('INSERT INTO games (series_id, n, our_side) VALUES (?, 1, ?)').run(lastInsertRowid, ourSide)

  return { id: Number(lastInsertRowid) }
})
