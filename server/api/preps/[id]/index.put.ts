export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event) ?? {}
  const db = useDb()
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })
    db.prepare('UPDATE preps SET name = ? WHERE id = ?').run(name, id)
  }
  if (body.opponent !== undefined) db.prepare('UPDATE preps SET opponent = ? WHERE id = ?').run(String(body.opponent).trim(), id)
  return { ok: true }
})
