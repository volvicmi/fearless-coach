import type { ScenarioColor } from '#shared/types'

/** Tailwind classes per scenario colour (written out in full so Tailwind generates them). */
export const SCENARIO_STYLE: Record<ScenarioColor, { dot: string, border: string, tint: string, text: string }> = {
  amber: { dot: 'bg-amber-400', border: 'border-amber-400', tint: 'bg-amber-400/10', text: 'text-amber-300' },
  sky: { dot: 'bg-sky-400', border: 'border-sky-400', tint: 'bg-sky-400/10', text: 'text-sky-300' },
  emerald: { dot: 'bg-emerald-400', border: 'border-emerald-400', tint: 'bg-emerald-400/10', text: 'text-emerald-300' },
  rose: { dot: 'bg-rose-400', border: 'border-rose-400', tint: 'bg-rose-400/10', text: 'text-rose-300' },
  violet: { dot: 'bg-violet-400', border: 'border-violet-400', tint: 'bg-violet-400/10', text: 'text-violet-300' },
  zinc: { dot: 'bg-zinc-400', border: 'border-zinc-500', tint: 'bg-zinc-400/10', text: 'text-zinc-300' },
}
