import { z } from 'zod'
import { DRAFT_ORDER, NO_BAN, fearlessLocked, otherSide, picksOf, slotsOf } from '#shared/draft'
import type { DraftStep, FearlessMode, SeriesFormat, Side } from '#shared/draft'
import { assignRoles, stepLabel, suggestPicks, unavailableNow } from '#shared/coach'
import type { CoachContext } from '#shared/coach'
import type { CoachAdvice, CoachMode, CoachReview, Player } from '#shared/types'

/** Our turn (advice) and their turn (prediction) share one answer shape. */
export const AdviceSchema = z.object({
  recommendations: z.array(z.object({
    champion: z.string().describe('Data Dragon id, e.g. "MonkeyKing"'),
    player: z.string().nullable().describe('Our player who would play it (our picks only, else null)'),
    confidence: z.enum(['high', 'medium', 'low']),
    reason: z.string(),
  })),
  enemyRead: z.string().describe('What the enemy draft is aiming for, one or two sentences'),
  plan: z.string().describe('Our plan / how we answer, one or two sentences'),
  warnings: z.array(z.string()),
})
export type RawAdvice = z.infer<typeof AdviceSchema>

const CompSchema = z.object({
  winRate: z.number().describe('Estimated chance to win from the draft alone, 0-100'),
  archetype: z.string().describe('e.g. "Engage teamfight", "Poke siege", "Split 1-3-1"'),
  winConditions: z.array(z.string()),
  powerSpikes: z.string().describe('When this comp is strongest: early / mid / late, key item or level spikes'),
  gamePlan: z.string().describe('How this comp should play the game, phase by phase'),
  howToCounter: z.array(z.string()).describe('How the OTHER team beats this comp'),
})
export const ReviewSchema = z.object({
  blue: CompSchema,
  red: CompSchema,
  verdict: z.string().describe('Who is favoured and why, plus the one thing our team must do'),
})
export type RawReview = z.infer<typeof ReviewSchema>

export interface CoachPrompt {
  mode: CoachMode
  /** Stable instructions */
  system: string
  /** Team pools: changes rarely, worth caching */
  team: string
  /** Draft state + task: changes every click */
  request: string
}

export const COACH_SYSTEM_PROMPT = `You are the draft coach of a competitive League of Legends team, advising live during a Fearless draft series.

How Fearless works: any champion picked in an earlier game of the series (by either team) is locked for both teams for the rest of the series. Bans never carry over between games.

Each request gives the series state, the current draft and ends with a TASK. There are three kinds of task.

ADVICE (our turn): give the best options for the step we must play.
- Only use champions from the AVAILABLE list. Write each champion as its Data Dragon id exactly as listed.
- Picks: strongly prefer our players' pools (tier S > A > B > C); suggest an off-pool champion only with a strong reason and say so. Name the player who would play it.
- Weigh: the enemy's revealed picks and likely roles, counters and lane matchups, synergy with our picks, damage mix, engage/disengage, scaling vs early power, flex picks that hide roles, and Fearless economy (avoid burning a player's last comfort picks early in a long series; remember which strong champions the enemy has already lost).
- Bans: target champions that threaten our likely comp or that the enemy has shown comfort on, plus the strongest available meta picks.
- The engine shortlist is a fast heuristic from our pools, not the answer: re-rank it with real draft knowledge.

PREDICTION (their turn): predict what the enemy will most likely pick or ban at this step.
- Only use champions from the AVAILABLE list, Data Dragon ids. player is null.
- Think like their drafter: roles they still need, answers to our picks, comfort shown in previous games, strong meta picks left, Fearless losses.
- In plan, say how we should answer if they take the top prediction.

For ADVICE and PREDICTION: at most 3 options, most likely / best first, each reason under 25 words.

REVIEW (draft complete): analyse both final compositions.
- winRate: your estimate of each side's chance to win from the draft alone (comp strength, synergy, scaling, matchups), not player skill. Blue + red = 100. Be realistic: drafts rarely go beyond 60-40.
- For each comp: archetype, 2-4 win conditions, power spikes, a game plan phase by phase, and 2-4 concrete ways the other team counters it.
- verdict: who is favoured and why, and the single most important thing our team must do.

Write every text field in correct French with all accents (é, è, à, ç…), concise and concrete, like a coach talking to players.`

/** Loads everything the coach needs for one game. */
export async function loadCoachContext(gameId: number): Promise<CoachContext> {
  const db = useDb()
  const gameRow = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId)
  if (!gameRow) throw createError({ statusCode: 404, statusMessage: 'game not found' })
  const game = toGame(gameRow)
  const series = db.prepare('SELECT format, fearless FROM series WHERE id = ?').get(game.seriesId) as { format: SeriesFormat, fearless: FearlessMode }
  const games = (db.prepare('SELECT * FROM games WHERE series_id = ? ORDER BY n').all(game.seriesId) as any[]).map(toGame)
  const { champions } = await getChampions()
  return { game, games, fearless: series.fearless, format: series.format, team: loadTeam(), champions }
}

/** What the coach can do right now: advise on our turn, predict on theirs, review once the draft is done. */
export function coachMode(ctx: CoachContext): { mode: CoachMode, step?: DraftStep } {
  const step = DRAFT_ORDER[ctx.game.actions.length]
  if (!step) return { mode: 'review' }
  return { mode: step.side === ctx.game.ourSide ? 'advice' : 'prediction', step }
}

function teamBlock(team: Player[], nameOf: (id: string) => string): string {
  if (!team.length) return 'OUR TEAM POOLS: none entered yet.'
  const lines = team.map((p) => {
    const pool = p.pool.length
      ? p.pool.map(e => `${nameOf(e.champId)} [${e.champId}] ${e.tier}${e.note ? ` (${e.note})` : ''}`).join(', ')
      : 'empty'
    return `- ${p.name} (${p.role}): ${pool}`
  })
  return `OUR TEAM POOLS (tier S = most comfortable):\n${lines.join('\n')}`
}

export function buildCoachPrompt(ctx: CoachContext): CoachPrompt {
  const { mode, step } = coachMode(ctx)
  const byId = new Map(ctx.champions.map(c => [c.id, c]))
  const nameOf = (id: string) => byId.get(id)?.name ?? id
  const us = ctx.game.ourSide
  const them = otherSide(us)

  const previousGames = ctx.games
    .filter(g => g.n < ctx.game.n)
    .map(g => `Game ${g.n} (we were ${g.ourSide}${g.winner ? `, ${g.winner === g.ourSide ? 'we won' : 'we lost'}` : ''}): our picks ${picksOf(g.actions, g.ourSide).map(nameOf).join(', ') || '-'}; their picks ${picksOf(g.actions, otherSide(g.ourSide)).map(nameOf).join(', ') || '-'}`)

  const draft = DRAFT_ORDER.slice(0, ctx.game.actions.length).map((s, i) => {
    const champ = ctx.game.actions[i]!
    return `${stepLabel(s, us)} (${s.side}): ${champ === NO_BAN ? 'no ban' : nameOf(champ)}`
  })

  // Our picks with the role our pools suggest, so the model doesn't guess our lanes.
  const ourRoles = assignRoles(picksOf(ctx.game.actions, us), ctx.team)
  const picksText = (side: Side) => slotsOf(ctx.game.actions, side, 'pick')
    .filter((c): c is string => !!c)
    .map(c => (side === us && ourRoles.has(c) ? `${nameOf(c)} (${ourRoles.get(c)})` : nameOf(c)))
    .join(', ') || 'none'

  const locked = [...fearlessLocked(ctx.fearless, ctx.games, ctx.game).keys()].map(nameOf)
  const blocked = unavailableNow(ctx)
  const available = ctx.champions.filter(c => !blocked.has(c.id)).map(c => c.id)
  const shortlist = mode === 'advice'
    ? suggestPicks(ctx, 8).map(s => `${s.champId} -> ${s.player} (${s.role}, ${s.tier}), score ${s.score.toFixed(2)}: ${s.reasons.join('; ')}`)
    : []

  const task = mode === 'review'
    ? `TASK: REVIEW. We were ${us}, they were ${them}. Analyse both compositions.`
    : mode === 'advice'
      ? `TASK: ADVICE for ${stepLabel(step!, us)} (${step!.type === 'ban' ? 'choose a ban' : 'choose a pick'}).`
      : `TASK: PREDICTION for ${stepLabel(step!, us)} (${step!.side} side ${step!.type}): what will they ${step!.type}?`

  const request = [
    `SERIES: ${ctx.format}, ${ctx.fearless === 'off' ? 'normal draft (no Fearless)' : 'Fearless draft'}, game ${ctx.game.n}. We are ${us} side.`,
    previousGames.length ? `PREVIOUS GAMES:\n${previousGames.join('\n')}` : 'PREVIOUS GAMES: none',
    ctx.fearless === 'off' ? '' : `LOCKED BY FEARLESS (both teams): ${locked.join(', ') || 'none'}`,
    `CURRENT DRAFT:\n${draft.length ? draft.join('\n') : '(draft not started)'}`,
    `OUR PICKS (${us}): ${picksText(us)}`,
    `THEIR PICKS (${them}): ${picksText(them)}`,
    shortlist.length ? `ENGINE SHORTLIST:\n${shortlist.join('\n')}` : '',
    mode === 'review' ? '' : `AVAILABLE for this step: ${available.join(', ')}`,
    task,
  ].filter(Boolean).join('\n\n')

  return { mode, system: COACH_SYSTEM_PROMPT, team: teamBlock(ctx.team, nameOf), request }
}

/** Drops anything the board would refuse (unknown or unavailable champions) and keeps the top 3. */
export function finalizeAdvice(ctx: CoachContext, raw: RawAdvice, model: string, started: number): CoachAdvice {
  const { mode, step } = coachMode(ctx)
  const blocked = unavailableNow(ctx)
  const ids = new Set(ctx.champions.map(c => c.id))
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const resolve = (name: string) =>
    ids.has(name) ? name : ctx.champions.find(c => normalize(c.id) === normalize(name) || normalize(c.name) === normalize(name))?.id

  const recommendations = raw.recommendations
    .map(r => ({ ...r, champId: resolve(r.champion) }))
    .filter((r): r is typeof r & { champId: string } => !!r.champId && !blocked.has(r.champId))
    .slice(0, 3)
    .map(({ champId, player, confidence, reason }) => ({ champId, player: mode === 'advice' ? player : null, confidence, reason }))

  return {
    kind: mode === 'prediction' ? 'prediction' : 'advice',
    step: step ? stepLabel(step, ctx.game.ourSide) : '',
    recommendations,
    enemyRead: raw.enemyRead,
    plan: raw.plan,
    warnings: raw.warnings,
    model,
    ms: Date.now() - started,
  }
}

/** Win rates are re-normalised so blue + red = 100 whatever the model returned. */
export function finalizeReview(raw: RawReview, model: string, started: number): CoachReview {
  const b = Math.max(0, raw.blue.winRate)
  const r = Math.max(0, raw.red.winRate)
  const blueWr = b + r > 0 ? Math.round((b / (b + r)) * 100) : 50
  return {
    kind: 'review',
    blue: { ...raw.blue, winRate: blueWr },
    red: { ...raw.red, winRate: 100 - blueWr },
    verdict: raw.verdict,
    model,
    ms: Date.now() - started,
  }
}
