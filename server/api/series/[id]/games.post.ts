import { MAX_GAMES } from '#shared/draft'
import type { SeriesFormat } from '#shared/draft'
import { publishChange } from '../../../utils/live'

/** Starts the next game of a series. */
export default defineEventHandler(async (event) => {
  const seriesId = Number(getRouterParam(event, 'id'))
  const { ourSide } = await readBody(event) ?? {}
  if (!['blue', 'red'].includes(ourSide)) throw createError({ statusCode: 400, statusMessage: 'Côté invalide' })

  const db = useDb()
  const series = db.prepare('SELECT format FROM series WHERE id = ?').get(seriesId) as { format: SeriesFormat } | undefined
  if (!series) throw createError({ statusCode: 404, statusMessage: 'Série introuvable' })

  const { last } = db.prepare('SELECT COALESCE(MAX(n), 0) AS last FROM games WHERE series_id = ?').get(seriesId) as { last: number }
  if (last >= MAX_GAMES[series.format]) throw createError({ statusCode: 400, statusMessage: 'La série en est déjà à sa dernière game' })

  const { lastInsertRowid } = db
    .prepare('INSERT INTO games (series_id, n, our_side) VALUES (?, ?, ?)')
    .run(seriesId, last + 1, ourSide)
  publishChange('series')
  return toGame(db.prepare('SELECT * FROM games WHERE id = ?').get(lastInsertRowid))
})
