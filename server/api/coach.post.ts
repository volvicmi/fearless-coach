import { publishChange } from '../utils/live'

/** AI advice for the current step of a game, or a past one: `{ gameId, provider?, draftOnly?, step? }`. The answer is kept in `coach_advice`, one per draft step: a new answer replaces the previous one of the same step. */
export default defineEventHandler(async (event) => {
  const { gameId, provider, draftOnly, step } = await readBody(event) ?? {}
  const ctx = await loadCoachContext(Number(gameId), draftOnly === true, step === undefined || step === null ? undefined : Number(step))
  const result = await askCoach(ctx, parseProvider(provider))
  const db = useDb()
  db.prepare('DELETE FROM coach_advice WHERE game_id = ? AND step_index = ?').run(Number(gameId), ctx.game.actions.length)
  const { lastInsertRowid } = db
    .prepare('INSERT INTO coach_advice (game_id, step_index, result) VALUES (?, ?, ?)')
    .run(Number(gameId), ctx.game.actions.length, JSON.stringify(result))
  publishChange('advice')
  return { ...result, historyId: Number(lastInsertRowid) }
})
