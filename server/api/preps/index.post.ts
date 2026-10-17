import { emptySlots } from '../../utils/prep'

/** Creates a prep with a first empty scenario: `{ name, opponent? }`. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) ?? {}
  const name = String(body.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })

  const db = useDb()
  const { lastInsertRowid } = db.prepare('INSERT INTO preps (name, opponent) VALUES (?, ?)').run(name, String(body.opponent ?? '').trim())
  db.prepare('INSERT INTO prep_scenarios (prep_id, name, our_side, slots) VALUES (?, ?, ?, ?)')
    .run(lastInsertRowid, 'Draft 1', 'blue', JSON.stringify(emptySlots()))
  return { id: Number(lastInsertRowid) }
})
