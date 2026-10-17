import { isIsoDate, isTime } from '#shared/planning'

/** Exception for one date: `{ date, available: true | false | null, start? }` (null = back to the usual days). */
export default defineEventHandler(async (event) => {
  const playerId = Number(getRouterParam(event, 'playerId'))
  const { date, available, start } = await readBody(event) ?? {}
  if (!isIsoDate(date)) throw createError({ statusCode: 400, statusMessage: 'Date invalide' })
  const db = useDb()
  if (available === null) {
    db.prepare('DELETE FROM availability_exceptions WHERE player_id = ? AND date = ?').run(playerId, date)
    return { ok: true }
  }
  if (typeof available !== 'boolean') throw createError({ statusCode: 400, statusMessage: 'Disponibilité invalide' })
  if (available && !isTime(start)) throw createError({ statusCode: 400, statusMessage: 'Heure invalide' })
  db.prepare(`INSERT INTO availability_exceptions (player_id, date, available, start) VALUES (?, ?, ?, ?)
    ON CONFLICT (player_id, date) DO UPDATE SET available = excluded.available, start = excluded.start`)
    .run(playerId, date, available ? 1 : 0, available ? start : null)
  return { ok: true }
})
