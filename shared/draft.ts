export type Side = 'blue' | 'red'
export type ActionType = 'ban' | 'pick'
/** 'hard' = Fearless draft, 'off' = normal draft (stored as is in the database) */
export type FearlessMode = 'hard' | 'off'
export type SeriesFormat = 'Bo1' | 'Bo3' | 'Bo5'

export interface DraftStep {
  side: Side
  type: ActionType
  /** 0-4: position within this side's bans or picks */
  slot: number
}

/** Marker stored in `actions` when a team skips a ban. */
export const NO_BAN = 'none'

export const MAX_GAMES: Record<SeriesFormat, number> = { Bo1: 1, Bo3: 3, Bo5: 5 }

const step = (side: Side, type: ActionType, slot: number): DraftStep => ({ side, type, slot })

/** Standard tournament draft: 3 bans each, 3 picks each, 2 bans each, 2 picks each. */
export const DRAFT_ORDER: DraftStep[] = [
  step('blue', 'ban', 0), step('red', 'ban', 0),
  step('blue', 'ban', 1), step('red', 'ban', 1),
  step('blue', 'ban', 2), step('red', 'ban', 2),

  step('blue', 'pick', 0),
  step('red', 'pick', 0), step('red', 'pick', 1),
  step('blue', 'pick', 1), step('blue', 'pick', 2),
  step('red', 'pick', 2),

  step('red', 'ban', 3), step('blue', 'ban', 3),
  step('red', 'ban', 4), step('blue', 'ban', 4),

  step('red', 'pick', 3),
  step('blue', 'pick', 3), step('blue', 'pick', 4),
  step('red', 'pick', 4),
]

export interface GameDraft {
  n: number
  ourSide: Side
  /** Champion ids (Data Dragon `id`) in DRAFT_ORDER order; its length is the current step. */
  actions: string[]
  winner?: Side | null
}

export const otherSide = (side: Side): Side => (side === 'blue' ? 'red' : 'blue')

/** Victoires nécessaires pour gagner la série (Bo3 → 2). */
export const winsNeeded = (format: SeriesFormat) => Math.ceil(MAX_GAMES[format] / 2)

/**
 * Score d'une série vu du joueur A (`ourSide` de chaque game) et vainqueur si quelqu'un a atteint la majorité.
 * Les games sans vainqueur ne comptent pas.
 */
export function seriesScore(
  format: SeriesFormat,
  games: { ourSide: Side, winner?: Side | null }[],
): { a: number, b: number, winner: 'a' | 'b' | null } {
  let a = 0
  let b = 0
  for (const g of games) {
    if (!g.winner) continue
    if (g.winner === g.ourSide) a++
    else b++
  }
  const needed = winsNeeded(format)
  return { a, b, winner: a >= needed ? 'a' : b >= needed ? 'b' : null }
}

/** The 5 ban or pick slots of one side, `null` where not played yet. */
export function slotsOf(actions: string[], side: Side, type: ActionType): (string | null)[] {
  const slots: (string | null)[] = [null, null, null, null, null]
  DRAFT_ORDER.forEach((s, i) => {
    if (s.side === side && s.type === type && i < actions.length) slots[s.slot] = actions[i]!
  })
  return slots
}

export function picksOf(actions: string[], side: Side): string[] {
  return slotsOf(actions, side, 'pick').filter((c): c is string => !!c)
}

/**
 * Champions nobody can pick in `current`, mapped to the game that burned them.
 * Fearless: a champion picked by either team in an earlier game is locked for both teams. Bans never carry over.
 */
export function fearlessLocked(mode: FearlessMode, games: GameDraft[], current: GameDraft): Map<string, number> {
  const locked = new Map<string, number>()
  if (mode === 'off') return locked
  for (const g of games) {
    if (g.n >= current.n) continue
    for (const champ of [...picksOf(g.actions, 'blue'), ...picksOf(g.actions, 'red')]) {
      if (!locked.has(champ)) locked.set(champ, g.n)
    }
  }
  return locked
}
