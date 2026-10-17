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
  if (!ok) throw createError({ statusCode: 400, statusMessage: 'invalid slots' })
  return slots as string[][]
}

export function validateColor(color: unknown): string {
  if (!SCENARIO_COLORS.includes(color as any)) throw createError({ statusCode: 400, statusMessage: 'invalid color' })
  return color as string
}
