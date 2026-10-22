import type { ScenarioColor } from '#shared/types'

/**
 * Label, hex and Tailwind classes per draft style tag (classes written out in full so Tailwind generates them).
 * Aggressive purple = engage, yellow = poke, bright but soft green = front to back: distinct from the blue / red sides.
 */
export const SCENARIO_STYLE: Record<ScenarioColor, { label: string, hex: string, dot: string, border: string, tint: string, text: string, solid: string }> = {
  'engage': { label: 'Engage', hex: '#9333EA', dot: 'bg-purple-600', border: 'border-purple-600', tint: 'bg-purple-600/20', text: 'text-purple-400', solid: 'bg-purple-600 text-white' },
  'poke': { label: 'Poke', hex: '#FACC15', dot: 'bg-yellow-400', border: 'border-yellow-400', tint: 'bg-yellow-400/20', text: 'text-yellow-300', solid: 'bg-yellow-400 text-yellow-950' },
  'front-to-back': { label: 'Front to back', hex: '#4ADE80', dot: 'bg-green-400', border: 'border-green-400', tint: 'bg-green-400/20', text: 'text-green-300', solid: 'bg-green-400 text-green-950' },
}

/** Older drafts may carry a colour from before the styles existed. */
export const styleOf = (color: string) => SCENARIO_STYLE[color as ScenarioColor] ?? SCENARIO_STYLE.engage
