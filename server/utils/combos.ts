import type { Combo } from '#shared/types'

export const MAX_PARTNERS = 12

export function toCombo(row: any): Combo {
  return { id: row.id, anchor: row.anchor, partners: JSON.parse(row.partners), note: row.note }
}

export function loadCombos(): Combo[] {
  return useDb().prepare('SELECT * FROM combos ORDER BY position, id').all().map(toCombo)
}

export async function assertChampion(id: unknown): Promise<string> {
  const { champions } = await getChampions()
  if (typeof id !== 'string' || !champions.some(c => c.id === id)) throw createError({ statusCode: 400, statusMessage: 'Champion inconnu' })
  return id
}
