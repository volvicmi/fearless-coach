import { assertChampion, toCombo } from '../../utils/combos'

/** New combo around a champion: `{ anchor, partners? }`. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) ?? {}
  const anchor = await assertChampion(body.anchor)
  const partners = Array.isArray(body.partners) ? await Promise.all(body.partners.map(assertChampion)) : []
  const db = useDb()
  // Un nouveau combo arrive en haut de la liste.
  const { first } = db.prepare('SELECT COALESCE(MIN(position), 1) AS first FROM combos').get() as { first: number }
  const { lastInsertRowid } = db.prepare('INSERT INTO combos (anchor, partners, position) VALUES (?, ?, ?)')
    .run(anchor, JSON.stringify(partners.filter(p => p !== anchor)), first - 1)
  return toCombo(db.prepare('SELECT * FROM combos WHERE id = ?').get(lastInsertRowid))
})
