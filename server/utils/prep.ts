import { DRAFT_ORDER } from '#shared/draft'
import { SCENARIO_COLORS } from '#shared/types'
import type { Prep, PrepScenario } from '#shared/types'

/** Up to this many alternatives per draft step. */
export const MAX_ALTERNATIVES = 6

export function emptySlots(): string[][] {
  return DRAFT_ORDER.map(() => [])
}

export function toPrep(row: any): Prep {
  return {
    id: row.id,
    name: row.name,
    opponent: row.opponent,
    createdAt: row.created_at,
    scenarioCount: row.scenario_count ?? undefined,
  }
}

export function toScenario(row: any): PrepScenario {
  return {
    id: row.id,
    prepId: row.prep_id,
    name: row.name,
    color: row.color,
    ourSide: row.our_side,
    slots: JSON.parse(row.slots),
    notes: row.notes,
    position: row.position,
  }
}

/** Throws a 400 unless `slots` is 20 lists of known, unique-per-step champion ids. */
export async function validateSlots(slots: unknown): Promise<string[][]> {
  const { champions } = await getChampions()
  const ids = new Set(champions.map(c => c.id))
  const ok = Array.isArray(slots)
    && slots.length === DRAFT_ORDER.length
    && slots.every(s => Array.isArray(s)
      && s.length <= MAX_ALTERNATIVES
      && new Set(s).size === s.length
      && s.every(c => typeof c === 'string' && ids.has(c)))
  if (!ok) throw createError({ statusCode: 400, statusMessage: 'Étapes invalides' })
  return slots as string[][]
}

export interface PreparedDraft extends PrepScenario {
  prepName: string
  opponent: string
  /** Prepared against the opponent of the series */
  matchesOpponent: boolean
}

/** Our prepared drafts: those against `opponent` first, then the most recent preps. */
export function loadPreparedDrafts(opponent: string | undefined, limit = 8): PreparedDraft[] {
  const target = (opponent ?? '').trim().toLowerCase()
  const rows = useDb().prepare(`
    SELECT s.*, p.name AS prep_name, p.opponent AS prep_opponent
    FROM prep_scenarios s JOIN preps p ON p.id = s.prep_id
    ORDER BY p.id DESC, s.position, s.id
  `).all() as any[]
  return rows
    .map(r => ({
      ...toScenario(r),
      prepName: r.prep_name,
      opponent: r.prep_opponent,
      matchesOpponent: !!target && r.prep_opponent.trim().toLowerCase() === target,
    }))
    .filter(s => s.slots.some(alts => alts.length))
    .sort((a, b) => Number(b.matchesOpponent) - Number(a.matchesOpponent))
    .slice(0, limit)
}

export function validateColor(color: unknown): string {
  if (!SCENARIO_COLORS.includes(color as any)) throw createError({ statusCode: 400, statusMessage: 'Style invalide' })
  return color as string
}
