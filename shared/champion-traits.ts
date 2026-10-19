/** Tiers used by every criterion list (S = best). The lists themselves live in the database (table `trait_entries`). */
export type Tier = 'S' | 'A' | 'B' | 'C'
export const TIERS: Tier[] = ['S', 'A', 'B', 'C']

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
