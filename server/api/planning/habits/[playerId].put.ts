import { isTime } from '#shared/planning'

/** Sets a usual day: `{ weekday: 0-6 (Monday = 0), start: "HH:MM" | null }` (null removes it). */
export default defineEventHandler(async (event) => {
  const playerId = Number(getRouterParam(event, 'playerId'))
  const { weekday, start } = await readBody(event) ?? {}
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw createError({ statusCode: 400, statusMessage: 'Jour de la semaine invalide' })
  const db = useDb()
  if (start === null) {
    db.prepare('DELETE FROM availability_habits WHERE player_id = ? AND weekday = ?').run(playerId, weekday)
  }
  else {
    if (!isTime(start)) throw createError({ statusCode: 400, statusMessage: 'Heure invalide' })
    db.prepare(`INSERT INTO availability_habits (player_id, weekday, start) VALUES (?, ?, ?)
      ON CONFLICT (player_id, weekday) DO UPDATE SET start = excluded.start`).run(playerId, weekday, start)
  }
  return { ok: true }
})
