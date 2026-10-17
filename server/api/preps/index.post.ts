import { emptySlots } from '../../utils/prep'

/** Creates a prep with a first empty scenario: `{ name?, opponent? }` (renamed later inside the prep). */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) ?? {}
  const db = useDb()
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM preps').get() as { n: number }
  const name = String(body.name ?? '').trim() || `Prep ${n + 1}`

  const { lastInsertRowid } = db.prepare('INSERT INTO preps (name, opponent) VALUES (?, ?)').run(name, String(body.opponent ?? '').trim())
  db.prepare('INSERT INTO prep_scenarios (prep_id, name, color, our_side, slots) VALUES (?, ?, ?, ?, ?)')
    .run(lastInsertRowid, 'Draft 1', 'engage', 'blue', JSON.stringify(emptySlots()))
  return { id: Number(lastInsertRowid) }
})
