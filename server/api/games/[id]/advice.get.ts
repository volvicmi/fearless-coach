/** The coach's answer of each draft step of this game (the latest one of a step), last step first (see the arrows in CoachPanel). */
export default defineEventHandler((event) => {
  const gameId = Number(getRouterParam(event, 'id'))
  const rows = useDb()
    .prepare('SELECT id, step_index, result FROM coach_advice WHERE id IN (SELECT MAX(id) FROM coach_advice WHERE game_id = ? GROUP BY step_index) ORDER BY step_index DESC')
    .all(gameId) as { id: number, step_index: number, result: string }[]
  return rows.map(r => ({
    id: r.id,
    stepIndex: r.step_index,
    result: JSON.parse(r.result),
  }))
})
