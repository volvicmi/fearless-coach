import { z } from 'zod'
import { DRAFT_ORDER, NO_BAN, fearlessLocked, otherSide, picksOf, slotsOf } from '#shared/draft'
import type { DraftStep, FearlessMode, SeriesFormat, Side } from '#shared/draft'
import { assignRoles, stepLabel, suggestPicks, unavailableNow } from '#shared/coach'
import { estimateWinRate } from '#shared/winrate'
import type { CoachContext } from '#shared/coach'
import type { CoachAdvice, CoachMode, CoachReview, Player, ProDraft, ProMeta } from '#shared/types'
import { loadProDrafts, loadProMeta } from './pro'

/** Our turn (advice) and their turn (prediction) share one answer shape. */
export const AdviceSchema = z.object({
  recommendations: z.array(z.object({
    champion: z.string().describe('Data Dragon id, e.g. "MonkeyKing"'),
    player: z.string().nullable().describe('Our player who would play it (our picks only, else null)'),
    confidence: z.enum(['high', 'medium', 'low']),
    reason: z.string(),
  })),
  enemyRead: z.string().describe('What the enemy draft is aiming for, one or two sentences'),
  plan: z.string().describe('The idea behind our draft: comp identity, synergies with our picks, what to look for next (two or three sentences)'),
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

You get several sources. Weigh them all together, none of them overrides the others:
- the whole champion pool of the game (the AVAILABLE list), not only our players' pools;
- our players' tier lists (strongest first, also inside each tier) and their recent ranked stats;
- the pro meta (presence, win rate, pick round in LCK/LEC) and real pro drafts that were actually played;
- the coach notes written by our staff (combos, usual answers, patch remarks): useful knowledge, to weigh like the rest;
- the current draft, the previous games of the series and the Fearless locks.

Each request ends with a TASK. There are three kinds of task.

ADVICE (our turn): give the best options for the step we must play.
- Only use champions from the AVAILABLE list. Write each champion as its Data Dragon id exactly as listed. Name the player who would play a pick.
- Think about the draft as a whole: what composition we are building, how the pick synergises with our picks already locked (engage + follow-up, bot lane duo, jungle-mid 2v2, wombo combos), what it does against their picks, damage mix, engage/disengage, scaling vs early power, flex picks that hide roles.
- Comfort matters but is not everything: a strong meta or synergy pick a player can play (pool, ranked games) can beat a comfort pick that doesn't fit the comp.
- Fearless economy: avoid burning a player's last comfort picks early in a long series; remember which strong champions the enemy has already lost.
- Bans: target what threatens the comp we are building, what the enemy has shown comfort on, and the strongest available meta picks.
- The engine shortlist is a fast heuristic, not the answer: re-rank it and look beyond it.
- In plan, explain the idea behind the draft: the comp identity, how our picks work together, and what to look for next.

PREDICTION (their turn): predict what the enemy will most likely pick or ban at this step.
- Only use champions from the AVAILABLE list, Data Dragon ids. player is null.
- Think like their drafter: roles they still need, the comp they are building, answers to our picks, comfort shown in previous games, how pro teams drafted similar situations, strong meta picks left, Fearless losses.
- In plan, say how we should answer if they take the top prediction.

For ADVICE and PREDICTION: at most 3 options, most likely / best first, each reason under 25 words.

REVIEW (draft complete): analyse both final compositions.
- winRate: start from the DATA ESTIMATE of the request (computed from pro results, our players' comfort and damage mix), then move it by at most 10 points for what the data can't see: synergies, lane matchups, scaling, engage vs disengage, comp identity. Blue + red = 100. In the verdict, say how far you moved from the data estimate and why.
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
  return { game, games, fearless: series.fearless, format: series.format, team: loadTeam(), champions, pro: loadProMeta() }
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
    const ready = p.pool.filter(e => e.tier !== 'P')
    const practice = p.pool.filter(e => e.tier === 'P')
    const pool = (ready.length
      ? ready.map(e => `${nameOf(e.champId)} [${e.champId}] ${e.tier}${e.note ? ` (${e.note})` : ''}`).join(', ')
      : 'empty')
    + (practice.length ? `; practising (not ready, avoid in official games): ${practice.map(e => nameOf(e.champId)).join(', ')}` : '')
    const ranked = p.soloq?.champions.slice(0, 10)
      .map(c => `${nameOf(c.champId)} ${c.games}g ${Math.round((c.wins / c.games) * 100)}%WR KDA ${((c.kills + c.assists) / Math.max(1, c.deaths)).toFixed(1)}${c.recent ? ` (${c.recent} in 30d)` : ''}`)
      .join(', ')
    const queues = p.soloq ? ` (${p.soloq.solo.games} SoloQ, ${p.soloq.flex.games} Flex)` : ''
    return `- ${p.name} (${p.role}): pool ${pool}${ranked ? `\n  ranked games${queues}: ${ranked}` : ''}`
  })
  return `OUR TEAM POOLS (tier S = most comfortable; listed strongest first, also inside each tier) and recent ranked stats (SoloQ/Flex, small samples are noisy):\n${lines.join('\n')}`
}

function notesBlock(): string {
  const notes = getSetting('notes').trim()
  return notes ? `COACH NOTES (written by our staff):\n${notes}` : ''
}

function proMetaBlock(meta: ProMeta | undefined, nameOf: (id: string) => string): string {
  if (!meta?.games) return ''
  const pct = (x: number) => Math.round(x * 100)
  const lines = meta.champions.slice(0, 40).map(c =>
    `${nameOf(c.champId)}: ${pct(c.presence)}% presence (${c.picks} picks, ${c.bans} bans), ${c.picks ? `${pct(c.winRate)}% WR` : 'never picked'}, avg pick round ${c.avgRound}, ${c.blindPct}% blind`)
  return `PRO META (${meta.games} pro games, LCK/LEC, most present first):\n${lines.join('\n')}`
}

function proDraftsBlock(drafts: ProDraft[], nameOf: (id: string) => string): string {
  if (!drafts.length) return ''
  const list = (actions: string[], side: Side, type: 'ban' | 'pick') =>
    slotsOf(actions, side, type).filter((c): c is string => !!c && c !== NO_BAN).map(nameOf).join(', ')
  const lines = drafts.map(d =>
    `${d.tournament} (patch ${d.patch}) ${d.blueTeam} blue${d.winner === 'blue' ? ' WON' : ''} vs ${d.redTeam} red${d.winner === 'red' ? ' WON' : ''}`
    + ` | bans blue: ${list(d.actions, 'blue', 'ban')}; red: ${list(d.actions, 'red', 'ban')}`
    + ` | picks blue (in order): ${list(d.actions, 'blue', 'pick')}; red: ${list(d.actions, 'red', 'pick')}`)
  return `REAL PRO DRAFTS sharing champions with this draft (or the latest ones):\n${lines.join('\n')}`
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

  const estimate = mode === 'review' ? estimateWinRate(ctx) : null
  const task = mode === 'review'
    ? `DATA ESTIMATE: blue ${estimate!.blue}% / red ${100 - estimate!.blue}%\n${estimate!.factors.map(f => `- ${f.label} (${f.impact >= 0 ? '+' : ''}${f.impact} pts for blue): ${f.detail}`).join('\n') || '- no data factor'}\n\nTASK: REVIEW. We were ${us}, they were ${them}. Analyse both compositions.`
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
    proDraftsBlock(loadProDrafts(ctx.game.actions.filter(a => a !== NO_BAN), 10), nameOf),
    shortlist.length ? `ENGINE SHORTLIST:\n${shortlist.join('\n')}` : '',
    mode === 'review' ? '' : `AVAILABLE for this step: ${available.join(', ')}`,
    task,
  ].filter(Boolean).join('\n\n')

  // Pools, pro meta and notes change rarely: they form the cached part of the prompt.
  const team = [teamBlock(ctx.team, nameOf), proMetaBlock(ctx.pro, nameOf), notesBlock()].filter(Boolean).join('\n\n')
  return { mode, system: COACH_SYSTEM_PROMPT, team, request }
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

/** Win rates are re-normalised so blue + red = 100, and kept within 10 points of the data estimate. */
export function finalizeReview(ctx: CoachContext, raw: RawReview, model: string, started: number): CoachReview {
  const data = estimateWinRate(ctx)
  const b = Math.max(0, raw.blue.winRate)
  const r = Math.max(0, raw.red.winRate)
  const aiBlue = b + r > 0 ? Math.round((b / (b + r)) * 100) : data.blue
  const blueWr = Math.min(data.blue + 10, Math.max(data.blue - 10, aiBlue))
  return {
    kind: 'review',
    blue: { ...raw.blue, winRate: blueWr },
    red: { ...raw.red, winRate: 100 - blueWr },
    verdict: raw.verdict,
    data,
    model,
    ms: Date.now() - started,
  }
}
