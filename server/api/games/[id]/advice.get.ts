/** Every coach answer given for this game, newest first (see the arrows in CoachPanel). */
export default defineEventHandler((event) => {
  const gameId = Number(getRouterParam(event, 'id'))
  const rows = useDb()
    .prepare('SELECT id, step_index, created_at, result FROM coach_advice WHERE game_id = ? ORDER BY id DESC')
    .all(gameId) as { id: number, step_index: number, created_at: string, result: string }[]
  return rows.map(r => ({
    id: r.id,
    stepIndex: r.step_index,
    createdAt: r.created_at,
    result: JSON.parse(r.result),
  }))
})
