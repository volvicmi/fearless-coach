import { randomBytes } from 'node:crypto'

/** Jeton secret de synchro drafter.lol d'une série (créé au premier appel, `?renew=1` pour en changer). */
export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const row = db.prepare('SELECT sync_token FROM series WHERE id = ?').get(id) as { sync_token: string } | undefined
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Série introuvable' })
  if (row.sync_token && !getQuery(event).renew) return { token: row.sync_token }
  const token = randomBytes(18).toString('base64url')
  db.prepare('UPDATE series SET sync_token = ? WHERE id = ?').run(token, id)
  return { token }
})
