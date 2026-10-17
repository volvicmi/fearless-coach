import type { ScenarioColor } from '#shared/types'

/** Label and Tailwind classes per draft style (written out in full so Tailwind generates them). */
export const SCENARIO_STYLE: Record<ScenarioColor, { label: string, dot: string, border: string, tint: string, text: string }> = {
  'engage': { label: 'Engage', dot: 'bg-rose-400', border: 'border-rose-400', tint: 'bg-rose-400/15', text: 'text-rose-300' },
  'poke': { label: 'Poke', dot: 'bg-sky-400', border: 'border-sky-400', tint: 'bg-sky-400/15', text: 'text-sky-300' },
  'front-to-back': { label: 'Front to back', dot: 'bg-emerald-400', border: 'border-emerald-400', tint: 'bg-emerald-400/15', text: 'text-emerald-300' },
}

/** Older drafts may carry a colour from before the styles existed. */
export const styleOf = (color: string) => SCENARIO_STYLE[color as ScenarioColor] ?? SCENARIO_STYLE.engage
