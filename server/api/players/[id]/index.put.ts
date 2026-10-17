import { ROLES } from '#shared/types'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event) ?? {}
  const db = useDb()

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'Le nom est obligatoire' })
    db.prepare('UPDATE players SET name = ? WHERE id = ?').run(name, id)
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) throw createError({ statusCode: 400, statusMessage: 'Rôle invalide' })
    db.prepare('UPDATE players SET role = ? WHERE id = ?').run(body.role, id)
  }
  if (body.status !== undefined) {
    if (!['starter', 'sub'].includes(body.status)) throw createError({ statusCode: 400, statusMessage: 'Statut invalide' })
    db.prepare('UPDATE players SET status = ? WHERE id = ?').run(body.status, id)
  }
  if (body.riotId !== undefined) {
    db.prepare('UPDATE players SET riot_id = ? WHERE id = ?').run(String(body.riotId).trim(), id)
  }
  return { ok: true }
})
