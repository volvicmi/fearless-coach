/** AI advice for the current step of a game: `{ gameId }`. The answer is also kept in `coach_advice`. */
export default defineEventHandler(async (event) => {
  const { gameId } = await readBody(event) ?? {}
  const ctx = await loadCoachContext(Number(gameId))
  const result = await askCoach(ctx)
  const { lastInsertRowid } = useDb()
    .prepare('INSERT INTO coach_advice (game_id, step_index, result) VALUES (?, ?, ?)')
    .run(Number(gameId), ctx.game.actions.length, JSON.stringify(result))
  return { ...result, historyId: Number(lastInsertRowid) }
})
