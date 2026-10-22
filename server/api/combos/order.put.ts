/** Range les combos : `{ ids }` dans l'ordre voulu, le premier en haut. */
export default defineEventHandler(async (event) => {
  const { ids } = await readBody(event) ?? {}
  if (!Array.isArray(ids) || !ids.every(Number.isInteger)) throw createError({ statusCode: 400, statusMessage: 'Ordre invalide' })
  const db = useDb()
  const update = db.prepare('UPDATE combos SET position = ? WHERE id = ?')
  db.exec('BEGIN')
  try { ids.forEach((id: number, i: number) => update.run(i, id)); db.exec('COMMIT') }
  catch (e) { db.exec('ROLLBACK'); throw e }
  return { ok: true }
})
