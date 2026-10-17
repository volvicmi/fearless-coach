import { DRAFT_ORDER, MAX_GAMES, NO_BAN, fearlessLocked, picksOf } from './draft'
import type { DraftStep, FearlessMode, GameDraft, SeriesFormat } from './draft'
import { ROLES } from './types'
import type { Champion, Player, Role, Tier } from './types'

export const TIER_VALUE: Record<Tier, number> = { S: 1, A: 0.75, B: 0.5, C: 0.3 }

export interface CoachContext {
  game: GameDraft
  games: GameDraft[]
  fearless: FearlessMode
  format: SeriesFormat
  team: Player[]
  champions: Champion[]
}

export interface Suggestion {
  champId: string
  player: string
  role: Role
  tier: Tier
  score: number
  reasons: string[]
}

/** Champions nobody can take now: already banned / picked this game, or Fearless-locked. */
export function unavailableNow(ctx: CoachContext): Set<string> {
  const out = new Set(ctx.game.actions.filter(a => a !== NO_BAN))
  for (const champ of fearlessLocked(ctx.fearless, ctx.games, ctx.game).keys()) out.add(champ)
  return out
}

/**
 * Guesses which role each of our picks plays, from the team pools.
 * A champion nobody has in pool stays unassigned (it doesn't close a role).
 */
export function assignRoles(picks: string[], team: Player[]): Map<string, Role> {
  const assigned = new Map<string, Role>()
  const taken = new Set<Role>()
  for (const champ of picks) {
    const options = team
      .flatMap(p => p.pool.filter(e => e.champId === champ).map(e => ({ role: p.role, value: TIER_VALUE[e.tier] })))
      .filter(o => !taken.has(o.role))
      .sort((a, b) => b.value - a.value)
    if (options[0]) {
      assigned.set(champ, options[0].role)
      taken.add(options[0].role)
    }
  }
  return assigned
}

const isMage = (c?: Champion) => !!c?.tags.includes('Mage')
const isMarksman = (c?: Champion) => !!c?.tags.includes('Marksman')

/** Ranked pick suggestions for our team at the current step (empty when it isn't our pick). */
export function suggestPicks(ctx: CoachContext, limit = 6): Suggestion[] {
  const step = DRAFT_ORDER[ctx.game.actions.length]
  if (!step || step.type !== 'pick' || step.side !== ctx.game.ourSide) return []

  const byId = new Map(ctx.champions.map(c => [c.id, c]))
  const blocked = unavailableNow(ctx)
  const ourPicks = picksOf(ctx.game.actions, ctx.game.ourSide)
  const filled = new Set(assignRoles(ourPicks, ctx.team).values())
  const openRoles = ROLES.filter(r => !filled.has(r))

  const gamesLeftAfterThis = MAX_GAMES[ctx.format] - ctx.game.n
  const fearlessOn = ctx.fearless !== 'off' && gamesLeftAfterThis > 0
  const earlyPick = ourPicks.length < 3

  // Which roles each champion covers across the team (flex picks hide information).
  const rolesOf = new Map<string, Set<Role>>()
  for (const p of ctx.team) for (const e of p.pool) {
    if (!rolesOf.has(e.champId)) rolesOf.set(e.champId, new Set())
    rolesOf.get(e.champId)!.add(p.role)
  }

  const ourMages = ourPicks.filter(c => isMage(byId.get(c))).length
  const ourMarksmen = ourPicks.filter(c => isMarksman(byId.get(c))).length

  const best = new Map<string, Suggestion>()
  for (const player of ctx.team) {
    if (!openRoles.includes(player.role)) continue
    const strongLeft = player.pool.filter(e => (e.tier === 'S' || e.tier === 'A') && !blocked.has(e.champId)).length

    for (const entry of player.pool) {
      if (blocked.has(entry.champId)) continue
      const champ = byId.get(entry.champId)
      let score = TIER_VALUE[entry.tier]
      const reasons = [`${entry.tier} tier for ${player.name}`]

      const flexRoles = rolesOf.get(entry.champId)
      if (earlyPick && flexRoles && flexRoles.size > 1) {
        score += 0.15
        reasons.push(`Flex (${[...flexRoles].join('/')}): hides the role`)
      }

      // Fearless economy: spending one of the last strong picks of a thin pool hurts later games.
      if (fearlessOn && (entry.tier === 'S' || entry.tier === 'A') && strongLeft <= gamesLeftAfterThis + 1) {
        score -= 0.2
        reasons.push(`Only ${strongLeft} S/A left for ${player.name} with ${gamesLeftAfterThis} game(s) to go`)
      }

      if (ourPicks.length >= 2 && ourMages === 0 && isMage(champ)) {
        score += 0.1
        reasons.push('Adds magic damage')
      }
      if (ourPicks.length >= 2 && ourMarksmen === 0 && isMarksman(champ)) {
        score += 0.1
        reasons.push('Adds sustained physical damage')
      }

      const prev = best.get(entry.champId)
      if (!prev || prev.score < score) {
        best.set(entry.champId, { champId: entry.champId, player: player.name, role: player.role, tier: entry.tier, score, reasons })
      }
    }
  }

  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Human-readable label of a step from our point of view, e.g. "Our pick 2". */
export function stepLabel(step: DraftStep, ourSide: GameDraft['ourSide']): string {
  const who = step.side === ourSide ? 'Our' : 'Their'
  return `${who} ${step.type} ${step.slot + 1}`
}
