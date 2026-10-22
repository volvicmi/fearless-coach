import { DRAFT_ORDER } from '#shared/draft'
import { ROLES, SCENARIO_COLORS } from '#shared/types'
import type { Prep, PrepCombo, PrepScenario, Role, ScenarioColor } from '#shared/types'
import { inferPrepRoles, MAX_PREP_COMBOS, prepComboKey } from '#shared/prep'

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
  const slots = JSON.parse(row.slots) as string[][]
  const storedRoles = JSON.parse(row.pick_roles ?? '[]') as Role[]
  const pickNotes = JSON.parse(row.pick_notes ?? '[]') as string[]
  return {
    id: row.id,
    prepId: row.prep_id,
    name: row.name,
    color: row.color,
    styles: row.styles ? JSON.parse(row.styles) : [row.color],
    rank: row.gallery_rank ?? null,
    ourSide: row.our_side,
    slots,
    notes: row.notes,
    position: row.position,
    pickRoles: storedRoles.length === 5 ? storedRoles : inferPrepRoles(slots, row.our_side),
    combos: JSON.parse(row.combos ?? '[]'),
    pickNotes: Array.from({ length: 5 }, (_, i) => String(pickNotes[i] ?? '')),
  }
}

/** Une note courte par pick (cinq, dans l'ordre de la draft). */
export function validatePickNotes(value: unknown): string[] {
  if (!Array.isArray(value) || value.length !== 5) throw createError({ statusCode: 400, statusMessage: 'Cinq notes de pick attendues' })
  return value.map(n => String(n ?? '').slice(0, 500))
}

export function validatePrepRoles(value: unknown): Role[] {
  if (!Array.isArray(value) || value.length !== 5 || new Set(value).size !== 5 || !value.every(r => ROLES.includes(r))) {
    throw createError({ statusCode: 400, statusMessage: 'Les cinq rôles doivent être distincts' })
  }
  return value as Role[]
}

export async function validatePrepCombos(value: unknown): Promise<PrepCombo[]> {
  if (!Array.isArray(value) || value.length > MAX_PREP_COMBOS) throw createError({ statusCode: 400, statusMessage: 'Combos invalides' })
  const { champions } = await getChampions()
  const ids = new Set(champions.map(c => c.id))
  const endpoint = (end: any) => end && Number.isInteger(end.pick) && end.pick >= 0 && end.pick < 5 && ids.has(end.champion)
  const valid = value.every(c => c && typeof c.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(c.id)
    && endpoint(c.a) && endpoint(c.b) && c.a.pick !== c.b.pick && c.a.champion !== c.b.champion)
  if (!valid || new Set(value.map(c => c.id)).size !== value.length || new Set(value.map(prepComboKey)).size !== value.length) {
    throw createError({ statusCode: 400, statusMessage: 'Combos invalides ou dupliqués' })
  }
  return value.map(c => ({ id: c.id, a: { pick: c.a.pick, champion: c.a.champion }, b: { pick: c.b.pick, champion: c.b.champion } }))
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

/** Zéro à trois tags de style, sans doublon, dans l'ordre de SCENARIO_COLORS. */
export function validateStyles(value: unknown): ScenarioColor[] {
  if (!Array.isArray(value) || !value.every(c => SCENARIO_COLORS.includes(c))) throw createError({ statusCode: 400, statusMessage: 'Style invalide' })
  return SCENARIO_COLORS.filter(c => value.includes(c))
}

export function validateColor(color: unknown): string {
  if (!SCENARIO_COLORS.includes(color as any)) throw createError({ statusCode: 400, statusMessage: 'Style invalide' })
  return color as string
}
