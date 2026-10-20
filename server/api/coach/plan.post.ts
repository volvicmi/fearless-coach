import { askPlan } from '../../utils/coach-plan'
import { loadCoachContext } from '../../utils/coach-prompt'
import { parseProvider } from '../../utils/coach-ai'

/** Game plan for a finished draft: `{ gameId, provider? }`. The plan is kept in `game_plans` (see GET /api/games/:id/plan). */
export default defineEventHandler(async (event) => {
  const { gameId, provider } = await readBody(event) ?? {}
  const ctx = await loadCoachContext(Number(gameId))
  if (ctx.game.actions.length < 20) throw createError({ statusCode: 400, statusMessage: 'Le plan se fait une fois la draft terminée' })
  const plan = await askPlan(ctx, parseProvider(provider))
  const { lastInsertRowid } = useDb()
    .prepare('INSERT INTO game_plans (game_id, result) VALUES (?, ?)')
    .run(Number(gameId), JSON.stringify(plan))
  return { ...plan, id: Number(lastInsertRowid) }
})
