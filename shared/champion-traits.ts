import data from './champion-traits.json'

export type Tier = 'S' | 'A' | 'B'
export const TIERS: Tier[] = ['S', 'A', 'B']

export const CRITERIA = [
  { id: 'tank', label: 'Tank / frontline', hint: 'Encaisse les dégâts et ouvre l’espace aux autres' },
  { id: 'engage', label: 'Engage', hint: 'Lance les combats et force le teamfight' },
  { id: 'poke', label: 'Poke', hint: 'Use les PV à distance avant le combat' },
  { id: 'scale', label: 'Scaling', hint: 'Devient très fort en fin de partie' },
  { id: 'antitank', label: 'Anti-tank (% PV max)', hint: 'Dégâts en % PV max, dégâts bruts ou pénétration : font fondre les tanks' },
  { id: 'waveclear', label: 'Waveclear', hint: 'Nettoie les vagues de sbires vite' },
  { id: 'splitpush', label: 'Split push', hint: 'Gagne seul une lane et attire l’équipe adverse' },
  { id: 'pick', label: 'Pick / catch', hint: 'Isole et tue une cible hors de sa position' },
  { id: 'peel', label: 'Peel', hint: 'Protège le carry des assassins et des engages' },
] as const
export type CriterionId = typeof CRITERIA[number]['id']

const TIER_LISTS = data.tiers as Record<CriterionId, Record<Tier, string[]>>

/** Tier d'un champion pour un critère, `undefined` s'il n'y figure pas. */
export function tierOf(criterion: CriterionId, champId: string): Tier | undefined {
  return TIERS.find(t => TIER_LISTS[criterion][t].includes(champId))
}

/** Rang dans la liste du critère : S avant A avant B, puis l'ordre écrit dans le fichier (meilleur d'abord). */
export function rankOf(criterion: CriterionId, champId: string): number {
  const lists = TIER_LISTS[criterion]
  let offset = 0
  for (const t of TIERS) {
    const i = lists[t].indexOf(champId)
    if (i >= 0) return offset + i
    offset += lists[t].length
  }
  return Number.POSITIVE_INFINITY
}

/**
 * Filtre (critère retenu = présent dans sa tier list) puis trie : alphabétique sans critère,
 * du meilleur au moins bon dans le critère sinon.
 */
export function sortChampions<T extends { id: string, name: string }>(champs: T[], criterion: CriterionId | null): T[] {
  const list = criterion ? champs.filter(c => tierOf(criterion, c.id)) : [...champs]
  return list.sort((a, b) =>
    (criterion ? rankOf(criterion, a.id) - rankOf(criterion, b.id) : 0) || a.name.localeCompare(b.name))
}

export const TRAITS_STATUS: string = data._status
