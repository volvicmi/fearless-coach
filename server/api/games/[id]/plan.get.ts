/** Latest game plan of this game, or null when none was written yet. */
export default defineEventHandler((event) => {
  const gameId = Number(getRouterParam(event, 'id'))
  const row = useDb()
    .prepare('SELECT id, result FROM game_plans WHERE game_id = ? ORDER BY id DESC LIMIT 1')
    .get(gameId) as { id: number, result: string } | undefined
  return row ? { ...JSON.parse(row.result), id: row.id } : null
})
