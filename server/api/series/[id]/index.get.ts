import type { SeriesDetail } from '#shared/types'

export default defineEventHandler((event): SeriesDetail => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const row = db.prepare('SELECT * FROM series WHERE id = ?').get(id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Série introuvable' })
  const games = db.prepare('SELECT * FROM games WHERE series_id = ? ORDER BY n').all(id)
  return { series: toSeries(row), games: games.map(toGame) }
})
