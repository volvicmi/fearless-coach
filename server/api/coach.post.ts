import type { SeriesFormat, FearlessMode } from '#shared/draft'

/** AI advice for the current step of a game: `{ gameId }`. */
export default defineEventHandler(async (event) => {
  const { gameId } = await readBody(event) ?? {}
  const db = useDb()

  const gameRow = db.prepare('SELECT * FROM games WHERE id = ?').get(Number(gameId))
  if (!gameRow) throw createError({ statusCode: 404, statusMessage: 'game not found' })
  const game = toGame(gameRow)
  const series = db.prepare('SELECT format, fearless FROM series WHERE id = ?').get(game.seriesId) as { format: SeriesFormat, fearless: FearlessMode }
  const games = (db.prepare('SELECT * FROM games WHERE series_id = ? ORDER BY n').all(game.seriesId) as any[]).map(toGame)
  const { champions } = await getChampions()

  return askCoach({ game, games, fearless: series.fearless, format: series.format, team: loadTeam(), champions })
})
