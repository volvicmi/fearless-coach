import { winsNeeded } from '#shared/draft'
import type { Series } from '#shared/types'

/** Score d'une série vu du joueur A (nous en équipe, le joueur 1 en duel), et si elle est jouée. */
export function seriesSummary(s: Series) {
  const results = s.results ?? []
  const a = results.filter(r => r === 'a').length
  const b = results.filter(r => r === 'b').length
  const needed = winsNeeded(s.format)
  return { a, b, over: a >= needed || b >= needed }
}

/** Noms des deux camps selon le mode. */
export function sideLabels(s: Series): { a: string, b: string } {
  return s.mode === 'duel' ? { a: s.playerA, b: s.playerB } : { a: 'Nous', b: s.opponent || 'Eux' }
}

/** Page d'une série selon son mode. */
export const seriesPath = (s: Series) => (s.mode === 'duel' ? `/duel/${s.id}` : `/series/${s.id}`)

/** « aujourd'hui », « hier », « il y a 3 j », puis la date. SQLite stocke l'heure en UTC. */
export function relativeDate(sqlDate: string): string {
  const d = new Date(`${sqlDate.replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'aujourd’hui'
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days} j`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
