import { picksOf } from './draft'
import type { Side } from './draft'
import { assignRoles } from './coach'
import type { CoachContext } from './coach'
import type { Champion, Tier } from './types'

/**
 * Data-based win chance of a finished (or partial) draft, with every factor explained.
 * It only uses what we can measure: pro results per champion, our players' comfort, damage mix.
 * The AI review starts from it and adjusts it with draft knowledge (synergies, matchups, scaling).
 */
export interface WinRateFactor {
  label: string
  detail: string
  /** Effect on BLUE's win chance, in percentage points */
  impact: number
}

export interface WinRateEstimate {
  /** Blue win chance, 0-100 (red = 100 - blue) */
  blue: number
  factors: WinRateFactor[]
}

/** Pro win rates are pulled toward 50% as if every champion had 10 extra games at 50%: 3/3 isn't 100%. */
const PRO_PRIOR_GAMES = 10
/** Same idea for a player's ranked games. */
const RANKED_PRIOR_GAMES = 5
const TIER_POINTS: Record<Tier, number> = { S: 2, A: 1, B: 0, C: -1, P: -3 }
const OFF_POOL_POINTS = -2

const shrink = (wins: number, games: number, prior: number) => (wins + prior * 0.5) / (games + prior)
const round1 = (x: number) => Math.round(x * 10) / 10
const pct = (x: number) => `${Math.round(x * 100)}%`

export function estimateWinRate(ctx: CoachContext): WinRateEstimate {
  const factors: WinRateFactor[] = []
  const us = ctx.game.ourSide
  const sign = (side: Side) => (side === 'blue' ? 1 : -1)
  const picks = { blue: picksOf(ctx.game.actions, 'blue'), red: picksOf(ctx.game.actions, 'red') }

  // 1. Pro strength: average (shrunk) pro win rate of each side's picks.
  const pro = new Map((ctx.pro?.champions ?? []).map(c => [c.champId, c]))
  if (pro.size) {
    const avg = (side: Side) => {
      const list = picks[side].map(c => pro.get(c)).map(p => (p ? shrink(p.wins, p.picks, PRO_PRIOR_GAMES) : 0.5))
      return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0.5
    }
    const blue = avg('blue')
    const red = avg('red')
    factors.push({
      label: 'Force pro des picks',
      detail: `WR pro moyen (LCK/LEC, petits échantillons ramenés vers 50 %) : bleu ${pct(blue)}, rouge ${pct(red)}`,
      impact: round1((blue - red) * 100),
    })
  }

  // 2. Our comfort: tier and ranked results of the player on each of our picks (we don't know the enemy's).
  const byId = new Map(ctx.champions.map(c => [c.id, c]))
  const nameOf = (id: string) => byId.get(id)?.name ?? id
  const roles = assignRoles(picks[us], ctx.team)
  if (picks[us].length && ctx.team.length) {
    let points = 0
    const notes: string[] = []
    for (const champ of picks[us]) {
      const role = roles.get(champ)
      const player = role && ctx.team.find(p => p.role === role && p.pool.some(e => e.champId === champ))
      const entry = player?.pool.find(e => e.champId === champ)
      if (!player || !entry) {
        points += OFF_POOL_POINTS
        notes.push(`${nameOf(champ)} hors pool`)
        continue
      }
      points += TIER_POINTS[entry.tier]
      const ranked = player.soloq?.champions.find(c => c.champId === champ)
      if (ranked && ranked.games >= 3) {
        const wr = shrink(ranked.wins, ranked.games, RANKED_PRIOR_GAMES)
        points += (wr - 0.5) * 20 // 60% shrunk WR → +2 points
        notes.push(`${nameOf(champ)} ${entry.tier}, ${ranked.games} games ranked à ${pct(ranked.wins / ranked.games)}`)
      }
      else {
        notes.push(`${nameOf(champ)} ${entry.tier}`)
      }
    }
    factors.push({
      label: 'Confort de nos joueurs',
      detail: notes.join(' · '),
      impact: round1((points / Math.max(1, picks[us].length)) * 2 * sign(us)),
    })
  }

  // 3. Damage mix: a comp with no magic or no physical carry is easy to itemise against.
  for (const side of ['blue', 'red'] as const) {
    if (picks[side].length < 5) continue
    const champs = picks[side].map(c => byId.get(c)).filter((c): c is Champion => !!c)
    const magic = champs.filter(c => c.tags.includes('Mage')).length
    const physical = champs.filter(c => c.tags.includes('Marksman') || (c.tags.includes('Fighter') && !c.tags.includes('Mage'))).length
    if (!magic || !physical) {
      factors.push({
        label: `Mix de dégâts (${side === 'blue' ? 'bleu' : 'rouge'})`,
        detail: `${side === 'blue' ? 'Bleu' : 'Rouge'} n’a ${!magic ? 'ni mage ni dégâts magiques' : 'aucun carry physique'} : facile à contrer en items`,
        impact: -3 * sign(side),
      })
    }
  }

  const total = factors.reduce((n, f) => n + f.impact, 0)
  return { blue: Math.round(Math.min(70, Math.max(30, 50 + total))), factors }
}

