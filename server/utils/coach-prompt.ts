import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { DRAFT_ORDER, NO_BAN, fearlessLocked, otherSide, picksOf, slotsOf } from '#shared/draft'
import type { DraftStep, FearlessMode, SeriesFormat, Side } from '#shared/draft'
import { assignRoles, canFillAnyRole, enemyRoles, freeRolesOf, stepLabel, suggestPicks, unavailableNow } from '#shared/coach'
import { estimateWinRate } from '#shared/winrate'
import { CRITERIA } from '#shared/champion-traits'
import type { CoachContext } from '#shared/coach'
import type { CoachAdvice, CoachMode, CoachReview, Combo, Player, ProDraft, ProMeta } from '#shared/types'
import { loadProMatchups, loadProMeta } from './pro'
import { loadPreparedDrafts } from './prep'
import type { PreparedDraft } from './prep'
import { loadCombos } from './combos'

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

The DRAFT comes first. Reason from the two compositions on the board: what each side is building, what it lacks, what counters it, which win condition each one has, damage mix, engage and disengage, frontline, scaling, pick order and side. Then use the other sources to refine the choice, never to replace that reasoning:
- the whole champion pool of the game (the AVAILABLE list), not only our players' pools: the best answer to the draft is often not in a pool;
- our players' tier lists (strongest first, also inside each tier) and their recent ranked stats: a feasibility check and a tiebreaker between draft-equivalent options, not the starting point;
- the pro meta (presence, win rate, pick round in LCK/LEC) and real pro drafts that were actually played. Use those drafts as precedents for comp against comp: look at what pro teams drafted into a similar composition, what won, and explain WHY they chose that answer (the synergy, the counter, the win condition, the damage or engage it provided). Reason from the drafts and your game knowledge only; never invent statistics;
- the coach notes written by our staff (combos, usual answers, patch remarks): useful knowledge, to weigh like the rest;
- our practised combos (a champion and the partners it is played with, e.g. a bot lane carry and its supports): when one side of a combo is picked, its partners are natural follow-ups;
- our prepared drafts (staff plans, with backup options per step, some prepared against this exact opponent): say when the live draft follows or leaves a plan, and suggest the planned option when it still fits;
- the current draft, the previous games of the series and the Fearless locks.

Each request ends with a TASK. There are three kinds of task.

ADVICE (our turn): give the best options for the step we must play.
- Only use champions from the AVAILABLE list. Write each champion as its Data Dragon id exactly as listed. Name the player who would play a pick.
- Think about the draft as a whole: what composition we are building, how the pick synergises with our picks already locked (engage + follow-up, bot lane duo, jungle-mid 2v2, wombo combos), what it does against their picks, damage mix, engage/disengage, scaling vs early power, flex picks that hide roles.
- Start from what the draft needs (missing roles, missing damage type, frontline, engage, answers to their threats), list the champions that fit it, then check which of them our players can play. Recommend a pick outside every pool when the draft clearly calls for it, and say the player would need to practise it. Never recommend a champion just because it sits in a pool.
- Fearless economy: avoid burning a player's last comfort picks early in a long series; remember which strong champions the enemy has already lost.
- Bans: target what threatens the comp we are building, what the enemy has shown comfort on, and the strongest available meta picks.
- The pool hints are a fast, pool-based heuristic: ignore them when the draft points elsewhere.
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

/**
 * Stable reference files from the project's `context/` folder (game knowledge only). Missing file = skipped.
 * Team data (pools, combos) is never duplicated in a file: it comes straight from the database.
 */
const CONTEXT_FILES = ['regles.md']

export function contextBlock(): string {
  return CONTEXT_FILES
    .map((name) => {
      try {
        return readFileSync(resolve(process.cwd(), 'context', name), 'utf8').trim()
      } catch {
        return ''
      }
    })
    .filter(Boolean)
    .join('\n\n')
}

/** Loads everything the coach needs for one game. */
export async function loadCoachContext(gameId: number, draftOnly = false): Promise<CoachContext> {
  const db = useDb()
  const gameRow = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId)
  if (!gameRow) throw createError({ statusCode: 404, statusMessage: 'Game introuvable' })
  const game = toGame(gameRow)
  const series = db.prepare('SELECT format, fearless, opponent, mode FROM series WHERE id = ?').get(game.seriesId) as { format: SeriesFormat, fearless: FearlessMode, opponent: string, mode: string }
  // En duel, personne n'est conseillé pendant la draft : l'IA ne parle qu'à la fin, via le verdict.
  if (series.mode === 'duel') throw createError({ statusCode: 400, statusMessage: 'Pas de conseil IA en duel : l’IA donne son verdict à la fin de la draft' })
  const games = (db.prepare('SELECT * FROM games WHERE series_id = ? ORDER BY n').all(game.seriesId) as any[]).map(toGame)
  const { champions } = await getChampions()
  return {
    game, games, fearless: series.fearless, format: series.format, team: draftOnly ? [] : loadTeam(), champions,
    pro: loadProMeta(), combos: draftOnly ? [] : loadCombos(), opponent: series.opponent, draftOnly,
  }
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
    // Legacy practice rows (tier P) are hidden in the app: never sent to the coach.
    const ready = p.pool.filter(e => e.tier !== 'P')
    const pool = ready.length
      ? ready.map(e => `${nameOf(e.champId)} [${e.champId}] ${e.tier}${e.train ? ' (à travailler en priorité)' : ''}${e.note ? ` (${e.note})` : ''}`).join(', ')
      : 'empty'
    const ranked = p.soloq?.champions.slice(0, 5)
      .map(c => `${nameOf(c.champId)} ${c.games}g ${Math.round((c.wins / c.games) * 100)}%WR KDA ${((c.kills + c.assists) / Math.max(1, c.deaths)).toFixed(1)}${c.recent ? ` (${c.recent} in 30d)` : ''}`)
      .join(', ')
    const queues = p.soloq ? ` (${p.soloq.solo.games} SoloQ, ${p.soloq.flex.games} Flex)` : ''
    return `- ${p.name} (${p.role}${p.status === 'sub' ? ', substitute' : ''}): pool ${pool}${ranked ? `\n  ranked games${queues}: ${ranked}` : ''}`
  })

  // Champions that sit in several players' pools (e.g. Viktor mid and adc): the role must be checked.
  const owners = new Map<string, string[]>()
  for (const p of team) {
    for (const e of p.pool) {
      if (e.tier !== 'P') owners.set(e.champId, [...(owners.get(e.champId) ?? []), `${p.name} ${p.role} ${e.tier}`])
    }
  }
  const shared = [...owners].filter(([, who]) => who.length > 1).map(([c, who]) => `${nameOf(c)} (${who.join(', ')})`)

  return [
    'OUR TEAM POOLS, straight from our Team tab. Tiers: S = mastered, first choices unless the comp needs something else; A = good picks; B = backups / flex; C = only if needed. A champion marked "à travailler en priorité" is one the player should practise first: among equal options, favour it. Inside a tier, the first listed is the strongest. Ranked stats (SoloQ/Flex) are small samples: they nuance a tier, they never replace it.',
    lines.join('\n'),
    shared.length ? `In several players' pools (check which role it would be played in before recommending it): ${shared.join('; ')}` : '',
  ].filter(Boolean).join('\n')
}

function combosBlock(combos: Combo[] | undefined, nameOf: (id: string) => string): string {
  if (!combos?.length) return ''
  const lines = combos.map(c => `- ${nameOf(c.anchor)} + ${c.partners.map(nameOf).join(' / ') || '(no partner yet)'}${c.note ? ` (${c.note})` : ''}`)
  return `OUR PRACTISED COMBOS:\n${lines.join('\n')}`
}

function preparedDraftsBlock(drafts: PreparedDraft[], opponent: string | undefined, nameOf: (id: string) => string): string {
  if (!drafts.length) return ''
  const steps = (d: PreparedDraft, side: Side, type: 'ban' | 'pick') => DRAFT_ORDER
    .map((s, i) => ({ s, alts: d.slots[i] ?? [] }))
    .filter(({ s, alts }) => s.side === side && s.type === type && alts.length)
    .map(({ s, alts }) => `${type === 'pick' ? `${side === 'blue' ? 'B' : 'R'}${s.slot + 1} ` : ''}${alts.map(nameOf).join('/')}`)
    .join(', ')
  // A prepared draft is only our side: our bans and our picks, in our side's pick order.
  const lines = drafts.map(d => [
    `- "${d.name}" (${d.color}, we ${d.ourSide}) from prep "${d.prepName}"${d.matchesOpponent ? ` against ${d.opponent}` : d.opponent ? ` (vs ${d.opponent})` : ''}`,
    `  our bans: ${steps(d, d.ourSide, 'ban') || '-'}`,
    `  our picks: ${steps(d, d.ourSide, 'pick') || '-'}`,
    d.notes ? `  notes: ${d.notes.replace(/\s+/g, ' ').slice(0, 300)}` : '',
  ].filter(Boolean).join('\n'))
  const header = drafts.some(d => d.matchesOpponent)
    ? `OUR PREPARED DRAFTS (first ones prepared against ${opponent}; "A/B" = main choice / backups):`
    : 'OUR PREPARED DRAFTS (none prepared against this opponent; "A/B" = main choice / backups):'
  return `${header}\n${lines.join('\n')}`
}

function notesBlock(): string {
  const notes = getSetting('notes').trim()
  return notes ? `COACH NOTES (written by our staff):\n${notes}` : ''
}

export function proMetaBlock(meta: ProMeta | undefined, nameOf: (id: string) => string): string {
  if (!meta?.games) return ''
  const pct = (x: number) => Math.round(x * 100)
  const lines = meta.champions.slice(0, 15).map(c =>
    `${nameOf(c.champId)}: ${pct(c.presence)}% presence (${c.picks} picks, ${c.bans} bans), ${c.picks ? `${pct(c.winRate)}% WR` : 'never picked'}, avg pick round ${c.avgRound}, ${c.blindPct}% blind`)
  return `PRO META (${meta.games} pro games, LCK/LEC, most present first):\n${lines.join('\n')}`
}

export function proDraftsBlock(drafts: ProDraft[], nameOf: (id: string) => string): string {
  if (!drafts.length) return ''
  const list = (actions: string[], side: Side, type: 'ban' | 'pick') =>
    slotsOf(actions, side, type).filter((c): c is string => !!c && c !== NO_BAN).map(nameOf).join(', ')
  const lines = drafts.map(d =>
    `${d.tournament} (patch ${d.patch}) ${d.blueTeam} blue${d.winner === 'blue' ? ' WON' : ''} vs ${d.redTeam} red${d.winner === 'red' ? ' WON' : ''}`
    + ` | bans blue: ${list(d.actions, 'blue', 'ban')}; red: ${list(d.actions, 'red', 'ban')}`
    + ` | picks blue (in order): ${list(d.actions, 'blue', 'pick')}; red: ${list(d.actions, 'red', 'pick')}`)
  return `REAL PRO DRAFTS closest to this matchup (our champions against theirs on opposite sides first, or the latest ones):\n${lines.join('\n')}`
}

/** Champions tagged S, A or B per domain in the Champions tab (editable by the team, never statistics). */
function loadTraitTags(): Map<string, Set<string>> {
  const rows = useDb()
    .prepare("SELECT criterion, champ_id FROM trait_entries WHERE tier IN ('S', 'A', 'B')")
    .all() as { criterion: string, champ_id: string }[]
  const byCriterion = new Map<string, Set<string>>()
  for (const r of rows) byCriterion.set(r.criterion, (byCriterion.get(r.criterion) ?? new Set()).add(r.champ_id))
  return byCriterion
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
  // Their roles: set by hand by our coach (certain) or guessed from each champion's usual role.
  const forced = ctx.game.enemyRoles ?? {}
  const theirRoles = enemyRoles(picksOf(ctx.game.actions, them), forced)
  const roleText = (side: Side, c: string) => {
    if (side === us) return ourRoles.has(c) ? ` (${ourRoles.get(c)})` : ''
    const role = theirRoles.get(c)
    return role ? ` (${role}, ${forced[c] ? 'confirmed' : 'guessed'})` : ''
  }
  const picksText = (side: Side) => slotsOf(ctx.game.actions, side, 'pick')
    .filter((c): c is string => !!c)
    .map(c => nameOf(c) + roleText(side, c))
    .join(', ') || 'none'

  const locked = [...fearlessLocked(ctx.fearless, ctx.games, ctx.game).keys()].map(nameOf)
  const blocked = unavailableNow(ctx)
  // Their roles still open (from their picks): a prediction must be a champion that can fill one of them.
  const theirFree = freeRolesOf(picksOf(ctx.game.actions, them), forced)
  const fitsTheirRoles = (id: string) => mode !== 'prediction' || canFillAnyRole(id, theirFree)
  const available = ctx.champions.filter(c => !blocked.has(c.id) && fitsTheirRoles(c.id)).map(c => c.id)
  const shortlist = mode === 'advice'
    ? suggestPicks(ctx, 4).map(s => `${s.champId} -> ${s.player} (${s.role}, ${s.tier}), score ${s.score.toFixed(2)}: ${s.reasons.join('; ')}`)
    : []

  const traits = loadTraitTags()
  const compLine = (side: Side) => {
    const picks = picksOf(ctx.game.actions, side)
    const covered: string[] = []
    const missing: string[] = []
    for (const c of CRITERIA) {
      const champs = picks.filter(id => traits.get(c.id)?.has(id))
      if (champs.length) covered.push(`${c.label}: ${champs.map(nameOf).join(', ')}`)
      else missing.push(c.label)
    }
    return `${side === us ? 'OUR' : 'THEIR'} COMP READ (tags from our Champions tab, approximate): ${covered.join(' | ') || 'nothing yet'}. Not covered: ${missing.join(', ')}.`
  }

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
    compLine(us),
    compLine(them),
    mode === 'prediction' ? `THEIR FREE ROLES (still to fill): ${theirFree.join(', ') || 'none'}. Only predict champions that can play one of these roles.` : '',
    ctx.draftOnly ? '' : preparedDraftsBlock(loadPreparedDrafts(ctx.opponent), ctx.opponent, nameOf),
    ctx.draftOnly ? 'DRAFT ONLY MODE: no player pools, combos or prepared drafts are given. Recommend purely from the draft (both compositions, counters, synergies, pro precedents) and set player to null.' : '',
    proDraftsBlock(loadProMatchups(picksOf(ctx.game.actions, us), picksOf(ctx.game.actions, them), 8), nameOf),
    shortlist.length ? `POOL HINTS (secondary, pool-based):\n${shortlist.join('\n')}` : '',
    mode === 'review' ? '' : `AVAILABLE for this step: ${available.join(', ')}`,
    task,
  ].filter(Boolean).join('\n\n')

  // Pools, pro meta and notes change rarely: they form the cached part of the prompt.
  const team = [ctx.draftOnly ? '' : teamBlock(ctx.team, nameOf), combosBlock(ctx.combos, nameOf), proMetaBlock(ctx.pro, nameOf), notesBlock()].filter(Boolean).join('\n\n')
  const system = [COACH_SYSTEM_PROMPT, contextBlock()].filter(Boolean).join('\n\n')
  return { mode, system, team, request }
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
    // A predicted pick must fit a role the enemy still has to fill.
    .filter(r => mode !== 'prediction' || canFillAnyRole(r.champId, freeRolesOf(picksOf(ctx.game.actions, otherSide(ctx.game.ourSide)), ctx.game.enemyRoles ?? {})))
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
