import { DRAFT_ORDER } from './draft'
import type { Side } from './draft'
import { CHAMPION_ROLES } from './champion-roles'
import { ROLES } from './types'
import type { PrepCombo, Role } from './types'

export const MAX_PREP_OPTIONS = 6
export const MAX_PREP_COMBOS = 60
export const PREP_ROLE_LABEL: Record<Role, string> = { top: 'Top', jungle: 'Jungle', mid: 'Mid', adc: 'ADC', support: 'Support' }

export function prepSteps(side: Side, type: 'pick' | 'ban'): number[] {
  return DRAFT_ORDER.map((step, index) => ({ step, index }))
    .filter(({ step }) => step.side === side && step.type === type)
    .sort((a, b) => a.step.slot - b.step.slot)
    .map(({ index }) => index)
}

/** Les anciennes préparations gardent leurs picks et leur ordre ; seul le rôle affiché est déduit. */
export function inferPrepRoles(slots: string[][], side: Side): Role[] {
  const used = new Set<Role>()
  const roles = prepSteps(side, 'pick').map((index) => {
    const role = (CHAMPION_ROLES[slots[index]?.[0] ?? ''] ?? []).find(r => !used.has(r))
    if (role) used.add(role)
    return role
  })
  return roles.map((role) => {
    if (role) return role
    const remaining = ROLES.find(r => !used.has(r))!
    used.add(remaining)
    return remaining
  })
}

export function prepComboKey(combo: Pick<PrepCombo, 'a' | 'b'>): string {
  return [combo.a, combo.b].map(end => `${end.pick}:${end.champion}`).sort().join('|')
}
