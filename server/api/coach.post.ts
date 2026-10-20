/** AI advice for the current step of a game: `{ gameId, provider?, draftOnly? }`. The answer is also kept in `coach_advice`. */
export default defineEventHandler(async (event) => {
  const { gameId, provider, draftOnly } = await readBody(event) ?? {}
  const ctx = await loadCoachContext(Number(gameId), draftOnly === true)
  const result = await askCoach(ctx, parseProvider(provider))
  const { lastInsertRowid } = useDb()
    .prepare('INSERT INTO coach_advice (game_id, step_index, result) VALUES (?, ?, ?)')
    .run(Number(gameId), ctx.game.actions.length, JSON.stringify(result))
  return { ...result, historyId: Number(lastInsertRowid) }
})
