import { MAX_PARTNERS, assertChampion, toCombo } from '../../utils/combos'

/** Partial update: `{ anchor?, partners?, note? }`. */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event) ?? {}
  const db = useDb()
  const row = db.prepare('SELECT * FROM combos WHERE id = ?').get(id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'combo not found' })

  if (body.anchor !== undefined) db.prepare('UPDATE combos SET anchor = ? WHERE id = ?').run(await assertChampion(body.anchor), id)
  if (body.partners !== undefined) {
    if (!Array.isArray(body.partners) || body.partners.length > MAX_PARTNERS) throw createError({ statusCode: 400, statusMessage: 'invalid partners' })
    const partners = [...new Set(await Promise.all(body.partners.map(assertChampion)))]
    db.prepare('UPDATE combos SET partners = ? WHERE id = ?').run(JSON.stringify(partners), id)
  }
  if (body.note !== undefined) db.prepare('UPDATE combos SET note = ? WHERE id = ?').run(String(body.note).slice(0, 500), id)
  return toCombo(db.prepare('SELECT * FROM combos WHERE id = ?').get(id))
})
