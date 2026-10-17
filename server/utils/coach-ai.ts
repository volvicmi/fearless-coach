import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { DRAFT_ORDER, NO_BAN, fearlessLocked, otherSide, picksOf, slotsOf } from '#shared/draft'
import { stepLabel, suggestPicks, unavailableFor } from '#shared/coach'
import type { CoachContext } from '#shared/coach'
import type { Champion, CoachAdvice, Player } from '#shared/types'

const AdviceSchema = z.object({
  recommendations: z.array(z.object({
    champion: z.string().describe('Data Dragon id, e.g. "MonkeyKing"'),
    player: z.string().nullable().describe('Our player who would play it (picks only)'),
    confidence: z.enum(['high', 'medium', 'low']),
    reason: z.string(),
  })),
  enemyRead: z.string().describe('What the enemy draft is aiming for, one or two sentences'),
  plan: z.string().describe('Our win condition / what to draft next, one or two sentences'),
  warnings: z.array(z.string()),
})

const SYSTEM_PROMPT = `You are the draft coach of a competitive League of Legends team, advising live during a Fearless draft series.

How Fearless works here: champions picked in earlier games of the series are locked (hard mode: for both teams; soft mode: only for the team that picked them). Bans never carry over between games.

For each request you get the series state, the current draft and the exact step we must play. Give the best options for that step:
- Only recommend champions from the AVAILABLE list of the request. Write each champion as its Data Dragon id exactly as listed.
- Picks: strongly prefer our players' pools (tier S > A > B > C); suggest an off-pool champion only with a strong reason and say so. Name the player who would play it.
- Weigh: the enemy's revealed picks and likely roles, counters and lane matchups, synergy with our picks, damage mix, engage/disengage, scaling vs early power, flex picks that hide roles, and Fearless economy (avoid burning a player's last comfort picks early in a long series; remember which strong champions the enemy has already lost).
- Bans: target champions that threaten our likely comp or that the enemy has shown comfort on, plus the strongest available meta picks. Never waste a ban on a champion already locked by Fearless.
- The engine shortlist in the request is a fast heuristic from our pools, not the answer: re-rank it with real draft knowledge.
- At most 3 recommendations, best first. Keep each reason under 25 words.

Write every text field in French, concise and concrete, like a coach talking to players between two clicks.`

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

function draftBlock(ctx: CoachContext, nameOf: (id: string) => string): string {
  const { game } = ctx
  const lines = DRAFT_ORDER.slice(0, game.actions.length).map((step, i) => {
    const champ = game.actions[i]!
    return `${stepLabel(step, game.ourSide)} (${step.side}): ${champ === NO_BAN ? 'no ban' : nameOf(champ)}`
  })
  return lines.length ? lines.join('\n') : '(draft not started)'
}

/** Builds the per-request part: changes every click, so it goes after the cached prefix. */
function requestBlock(ctx: CoachContext, champions: Champion[]): string {
  const step = DRAFT_ORDER[ctx.game.actions.length]!
  const byId = new Map(champions.map(c => [c.id, c]))
  const nameOf = (id: string) => byId.get(id)?.name ?? id
  const us = ctx.game.ourSide
  const them = otherSide(us)

  const previousGames = ctx.games
    .filter(g => g.n < ctx.game.n)
    .map(g => `Game ${g.n} (we were ${g.ourSide}): our picks ${picksOf(g.actions, g.ourSide).map(nameOf).join(', ') || '-'}; their picks ${picksOf(g.actions, otherSide(g.ourSide)).map(nameOf).join(', ') || '-'}`)

  const lockedUs = [...fearlessLocked(ctx.fearless, ctx.games, ctx.game, us).keys()].map(nameOf)
  const lockedThem = [...fearlessLocked(ctx.fearless, ctx.games, ctx.game, them).keys()].map(nameOf)
  const blocked = unavailableFor(ctx, step)
  const available = champions.filter(c => !blocked.has(c.id)).map(c => c.id)

  const shortlist = suggestPicks(ctx, 8)
    .map(s => `${s.champId} -> ${s.player} (${s.role}, ${s.tier}), score ${s.score.toFixed(2)}: ${s.reasons.join('; ')}`)

  return [
    `SERIES: ${ctx.format}, fearless ${ctx.fearless}, game ${ctx.game.n}. We are ${us} side.`,
    previousGames.length ? `PREVIOUS GAMES:\n${previousGames.join('\n')}` : 'PREVIOUS GAMES: none',
    `LOCKED BY FEARLESS FOR US: ${lockedUs.join(', ') || 'none'}`,
    `LOCKED BY FEARLESS FOR THEM: ${lockedThem.join(', ') || 'none'}`,
    `CURRENT DRAFT:\n${draftBlock(ctx, nameOf)}`,
    `OUR PICKS SO FAR: ${slotsOf(ctx.game.actions, us, 'pick').filter(Boolean).map(c => nameOf(c!)).join(', ') || 'none'}`,
    `THEIR PICKS SO FAR: ${slotsOf(ctx.game.actions, them, 'pick').filter(Boolean).map(c => nameOf(c!)).join(', ') || 'none'}`,
    shortlist.length ? `ENGINE SHORTLIST:\n${shortlist.join('\n')}` : '',
    `AVAILABLE for this step: ${available.join(', ')}`,
    `NOW: ${stepLabel(step, us)} (${step.type === 'ban' ? 'choose a ban' : 'choose a pick'}). What should we do?`,
  ].filter(Boolean).join('\n\n')
}

let client: Anthropic | undefined

export async function askCoach(ctx: CoachContext): Promise<CoachAdvice> {
  const step = DRAFT_ORDER[ctx.game.actions.length]
  if (!step) throw createError({ statusCode: 400, statusMessage: 'The draft is complete' })
  if (step.side !== ctx.game.ourSide) throw createError({ statusCode: 400, statusMessage: "It's the enemy's turn" })
  if (!process.env.ANTHROPIC_API_KEY) {
    throw createError({ statusCode: 503, statusMessage: 'ANTHROPIC_API_KEY is missing: add it to the .env file and restart the server' })
  }

  const { claudeModel, claudeEffort } = useRuntimeConfig()
  client ??= new Anthropic()
  const byId = new Map(ctx.champions.map(c => [c.id, c]))
  const nameOf = (id: string) => byId.get(id)?.name ?? id
  const started = Date.now()

  let response
  try {
    response = await client.beta.messages.parse({
      model: claudeModel,
      max_tokens: 8000,
      output_config: {
        effort: claudeEffort as 'low' | 'medium' | 'high',
        format: betaZodOutputFormat(AdviceSchema),
      },
      // Re-runs the request on a fallback model if a safety classifier declines it.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: SYSTEM_PROMPT },
        // Team pools change rarely: cache everything up to here, the draft state comes after.
        { type: 'text', text: teamBlock(ctx.team, nameOf), cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: requestBlock(ctx, ctx.champions) }],
    })
  }
  catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw createError({ statusCode: 503, statusMessage: 'Invalid ANTHROPIC_API_KEY' })
    if (err instanceof Anthropic.RateLimitError) throw createError({ statusCode: 429, statusMessage: 'Claude rate limit reached, retry in a moment' })
    if (err instanceof Anthropic.APIError) throw createError({ statusCode: 502, statusMessage: `Claude API error ${err.status}: ${err.message}` })
    throw err
  }

  if (response.stop_reason === 'refusal') throw createError({ statusCode: 502, statusMessage: 'Claude declined this request' })
  const advice = response.parsed_output
  if (!advice) throw createError({ statusCode: 502, statusMessage: 'Claude returned an unreadable answer' })

  // Never show a recommendation the board would refuse.
  const blocked = unavailableFor(ctx, step)
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const resolve = (raw: string) =>
    byId.has(raw) ? raw : ctx.champions.find(c => normalize(c.id) === normalize(raw) || normalize(c.name) === normalize(raw))?.id

  const recommendations = advice.recommendations
    .map(r => ({ ...r, champId: resolve(r.champion) }))
    .filter((r): r is typeof r & { champId: string } => !!r.champId && !blocked.has(r.champId))
    .slice(0, 3)
    .map(({ champId, player, confidence, reason }) => ({ champId, player, confidence, reason }))

  return {
    step: stepLabel(step, ctx.game.ourSide),
    recommendations,
    enemyRead: advice.enemyRead,
    plan: advice.plan,
    warnings: advice.warnings,
    model: response.model,
    ms: Date.now() - started,
  }
}
