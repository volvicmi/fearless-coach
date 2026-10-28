import { DRAFT_ORDER, MAX_GAMES, NO_BAN, fearlessLocked, otherSide, picksOf } from './draft'
import type { DraftStep, FearlessMode, GameDraft, SeriesFormat } from './draft'
import { ROLES } from './types'
import type { Champion, Combo, Player, ProMeta, Role, Tier } from './types'
import { CHAMPION_ROLES } from './champion-roles'

export const TIER_VALUE: Record<Tier, number> = { S: 1, A: 0.75, B: 0.5, C: 0.3, P: 0.1 }

export interface CoachContext {
  game: GameDraft
  games: GameDraft[]
  fearless: FearlessMode
  format: SeriesFormat
  team: Player[]
  champions: Champion[]
  /** Pro meta from gol.gg, when imported */
  pro?: ProMeta
  /** Our practised combos (Jhin + Shen / Camille / Alistar…) */
  combos?: Combo[]
  /** Opponent of the series, to find the drafts prepared against them */
  opponent?: string
  /** « Draft seule » : ni pools, ni combos, ni drafts préparées envoyés à l'IA, elle ne raisonne que sur la draft */
  draftOnly?: boolean
}

/** Champions that form a practised combo with `champ`. */
export function comboPartners(combos: Combo[] | undefined, champ: string): string[] {
  const out = new Set<string>()
  for (const c of combos ?? []) {
    if (c.anchor === champ) c.partners.forEach(p => out.add(p))
    if (c.partners.includes(champ)) out.add(c.anchor)
  }
  return [...out]
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

/**
 * Role of each pick of one side: the role set by hand first (`forced`, champion id -> role),
 * then `base` (for our side: the roles our pools suggest), then each other pick takes its first usual role still free.
 * A champion missing from CHAMPION_ROLES gets none.
 */
export function rolesOfSide(picks: string[], forced: Record<string, Role> = {}, base = new Map<string, Role>()): Map<string, Role> {
  const out = new Map<string, Role>()
  for (const champ of picks) if (forced[champ]) out.set(champ, forced[champ])
  const taken = new Set(out.values())
  for (const champ of picks) {
    const role = base.get(champ)
    if (!out.has(champ) && role && !taken.has(role)) { taken.add(role); out.set(champ, role) }
  }
  for (const champ of picks) {
    if (out.has(champ)) continue
    const role = CHAMPION_ROLES[champ]?.find(r => !taken.has(r))
    if (role) { taken.add(role); out.set(champ, role) }
  }
  return out
}

/** Roles a team still has to fill, from its picks (and the roles we set by hand). */
export function freeRolesOf(picks: string[], forced: Record<string, Role> = {}): Role[] {
  const taken = new Set(rolesOfSide(picks, forced).values())
  return ROLES.filter(r => !taken.has(r))
}

/** Can this champion be played in one of these roles (unknown champions are not filtered out)? */
export function canFillAnyRole(champ: string, roles: Role[]): boolean {
  const known = CHAMPION_ROLES[champ]
  return !known || known.some(r => roles.includes(r))
}

const isMage = (c?: Champion) => !!c?.tags.includes('Mage')
const isMarksman = (c?: Champion) => !!c?.tags.includes('Marksman')

/**
 * What the other team looks like, from the Data Dragon tags of its picks (no statistics here).
 * Used by the counter rules in suggestPicks.
 */
export function enemyProfile(picks: string[], byId: Map<string, Champion>) {
  const tagsOf = picks.map(c => byId.get(c)?.tags ?? [])
  const count = (tag: string) => tagsOf.filter(t => t.includes(tag)).length
  return {
    ranged: count('Marksman') + count('Mage'),
    assassins: count('Assassin'),
  }
}

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

  const proById = new Map((ctx.pro?.champions ?? []).map(c => [c.champId, c]))
  const theirs = enemyProfile(picksOf(ctx.game.actions, otherSide(ctx.game.ourSide)), byId)
  const ourMages = ourPicks.filter(c => isMage(byId.get(c))).length
  const ourMarksmen = ourPicks.filter(c => isMarksman(byId.get(c))).length

  const best = new Map<string, Suggestion>()
  for (const player of ctx.team) {
    if (!openRoles.includes(player.role)) continue
    const strongLeft = player.pool.filter(e => (e.tier === 'S' || e.tier === 'A') && !blocked.has(e.champId)).length

    for (const entry of player.pool) {
      // Practice champions aren't ready for official games.
      if (entry.tier === 'P' || blocked.has(entry.champId)) continue
      const champ = byId.get(entry.champId)
      // Inside a tier, the leftmost champion is the player's strongest: small edge, never enough to jump a tier.
      const rankInTier = player.pool.filter(e => e.tier === entry.tier).indexOf(entry)
      let score = TIER_VALUE[entry.tier] - Math.min(rankInTier, 5) * 0.01
      const reasons = [`Tier ${entry.tier} pour ${player.name}${rankInTier === 0 ? ' (en tête du tier)' : ''}`]

      // Ranked form: only trusted from 5 games, capped so it adjusts the tier instead of replacing it.
      const ranked = player.soloq?.champions.find(c => c.champId === entry.champId)
      if (ranked && ranked.games >= 5) {
        const wr = ranked.wins / ranked.games
        score += Math.max(-0.1, Math.min(0.1, (wr - 0.5) * 0.5))
        if (ranked.recent >= 5) score += 0.05
        reasons.push(`Ranked : ${ranked.games} games, ${Math.round(wr * 100)}% WR${ranked.recent ? `, ${ranked.recent} sur 30 jours` : ''}`)
      }

      // Pro meta: presence in LCK/LEC, a nudge rather than a rule.
      const pro = proById.get(entry.champId)
      if (pro && pro.presence >= 0.2) {
        score += Math.min(pro.presence, 0.9) * 0.1
        reasons.push(`Pro : ${Math.round(pro.presence * 100)}% de présence${pro.picks ? `, ${Math.round(pro.winRate * 100)}% WR` : ''}`)
      }

      // Practised combo with one of our picks (bot lane duo, jungle-mid…): strong signal.
      const comboWith = comboPartners(ctx.combos, entry.champId).filter(c => ourPicks.includes(c))
      if (comboWith.length) {
        score += 0.15
        reasons.push(`Combo avec ${comboWith.map(c => byId.get(c)?.name ?? c).join(', ')}`)
      }

      const flexRoles = rolesOf.get(entry.champId)
      if (earlyPick && flexRoles && flexRoles.size > 1) {
        score += 0.15
        reasons.push(`Flex (${[...flexRoles].join('/')}) : cache le rôle`)
      }

      // Fearless economy: spending one of the last strong picks of a thin pool hurts later games.
      if (fearlessOn && (entry.tier === 'S' || entry.tier === 'A') && strongLeft <= gamesLeftAfterThis + 1) {
        score -= 0.2
        reasons.push(`Plus que ${strongLeft} S/A pour ${player.name} avec encore ${gamesLeftAfterThis} game(s) à jouer`)
      }

      // Counter rules (game knowledge, not statistics): poke wants an engage front line, assassins want peel.
      if (theirs.ranged >= 2 && champ?.tags.includes('Tank')) {
        score += 0.1
        reasons.push(`Contre leur poke (${theirs.ranged} tireurs/mages) : engage et front line`)
      }
      if (theirs.assassins >= 1 && champ?.tags.includes('Support') && champ?.tags.includes('Tank')) {
        score += 0.08
        reasons.push('Contre leurs assassins : peel et protection')
      }

      if (ourPicks.length >= 2 && ourMages === 0 && isMage(champ)) {
        score += 0.1
        reasons.push('Apporte des dégâts magiques')
      }
      if (ourPicks.length >= 2 && ourMarksmen === 0 && isMarksman(champ)) {
        score += 0.1
        reasons.push('Apporte des dégâts physiques soutenus')
      }

      const prev = best.get(entry.champId)
      if (!prev || prev.score < score) {
        best.set(entry.champId, { champId: entry.champId, player: player.name, role: player.role, tier: entry.tier, score, reasons })
      }
    }
  }

  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Libellé lisible d’une étape de notre point de vue, ex. « Notre pick 2 ». */
export function stepLabel(step: DraftStep, ourSide: GameDraft['ourSide']): string {
  const who = step.side === ourSide ? 'Notre' : 'Leur'
  return `${who} ${step.type} ${step.slot + 1}`
}
