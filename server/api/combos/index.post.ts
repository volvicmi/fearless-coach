import { assertChampion, toCombo } from '../../utils/combos'

/** New combo around a champion: `{ anchor, partners? }`. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) ?? {}
  const anchor = await assertChampion(body.anchor)
  const partners = Array.isArray(body.partners) ? await Promise.all(body.partners.map(assertChampion)) : []
  const db = useDb()
  const { last } = db.prepare('SELECT COALESCE(MAX(position), -1) AS last FROM combos').get() as { last: number }
  const { lastInsertRowid } = db.prepare('INSERT INTO combos (anchor, partners, position) VALUES (?, ?, ?)')
    .run(anchor, JSON.stringify(partners.filter(p => p !== anchor)), last + 1)
  return toCombo(db.prepare('SELECT * FROM combos WHERE id = ?').get(lastInsertRowid))
})
