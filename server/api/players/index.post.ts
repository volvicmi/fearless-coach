import { ROLES } from '#shared/types'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) ?? {}
  const name = String(body.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })
  if (!ROLES.includes(body.role)) throw createError({ statusCode: 400, statusMessage: 'invalid role' })

  const { lastInsertRowid } = useDb()
    .prepare('INSERT INTO players (name, role, riot_id) VALUES (?, ?, ?)')
    .run(name, body.role, String(body.riotId ?? '').trim())
  return { id: Number(lastInsertRowid) }
})
