import { emptySlots, validateStyles } from '../../utils/prep'

/** Creates a prep with its single draft, generic names (renamed later in the editor): `{ styles? }`. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) ?? {}
  const db = useDb()
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM preps').get() as { n: number }
  const { drafts } = db.prepare('SELECT COUNT(*) AS drafts FROM prep_scenarios').get() as { drafts: number }
  const name = String(body.name ?? '').trim() || `Prep ${n + 1}`
  const styles = validateStyles(body.styles ?? [])

  const { lastInsertRowid } = db.prepare('INSERT INTO preps (name, opponent) VALUES (?, ?)').run(name, String(body.opponent ?? '').trim())
  // Une nouvelle draft arrive en tête de la galerie.
  const { first } = db.prepare('SELECT MIN(gallery_rank) AS first FROM prep_scenarios').get() as { first: number | null }
  db.prepare('INSERT INTO prep_scenarios (prep_id, name, color, styles, our_side, slots, gallery_rank) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(lastInsertRowid, `Draft ${drafts + 1}`, styles[0] ?? 'engage', JSON.stringify(styles), 'blue', JSON.stringify(emptySlots()), (first ?? 0) - 1)
  return { id: Number(lastInsertRowid) }
})
