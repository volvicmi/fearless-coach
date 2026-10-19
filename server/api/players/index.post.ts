import { ROLES } from '#shared/types'
import { publishChange } from '../../utils/live'

export default defineEventHandler(async (event) => {
  const body = await readBody(event) ?? {}
  const name = String(body.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Le nom est obligatoire' })
  if (!ROLES.includes(body.role)) throw createError({ statusCode: 400, statusMessage: 'Rôle invalide' })

  const { lastInsertRowid } = useDb()
    .prepare('INSERT INTO players (name, role, riot_id) VALUES (?, ?, ?)')
    .run(name, body.role, String(body.riotId ?? '').trim())
  publishChange('team')
  return { id: Number(lastInsertRowid) }
})
