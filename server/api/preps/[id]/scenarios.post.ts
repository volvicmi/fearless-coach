import { emptySlots, toScenario } from '../../../utils/prep'

/** Adds a scenario to a prep: empty, or a copy of `copyFrom` (a scenario id). */
export default defineEventHandler(async (event) => {
  const prepId = Number(getRouterParam(event, 'id'))
  const { copyFrom } = await readBody(event) ?? {}
  const db = useDb()
  if (!db.prepare('SELECT 1 FROM preps WHERE id = ?').get(prepId)) throw createError({ statusCode: 404, statusMessage: 'prep not found' })

  const { n, last } = db.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(position), -1) AS last FROM prep_scenarios WHERE prep_id = ?').get(prepId) as { n: number, last: number }
  const source = copyFrom ? db.prepare('SELECT * FROM prep_scenarios WHERE id = ? AND prep_id = ?').get(Number(copyFrom), prepId) as any : null

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO prep_scenarios (prep_id, name, color, our_side, slots, notes, position) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    prepId,
    source ? `${source.name} (copy)` : `Draft ${n + 1}`,
    source?.color ?? 'engage',
    source?.our_side ?? 'blue',
    source?.slots ?? JSON.stringify(emptySlots()),
    source?.notes ?? '',
    last + 1,
  )
  return toScenario(db.prepare('SELECT * FROM prep_scenarios WHERE id = ?').get(lastInsertRowid))
})
