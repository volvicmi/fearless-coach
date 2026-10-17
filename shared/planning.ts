/**
 * Weekly availability: each player has habits (usual days + time) and per-date exceptions.
 * Weeks start on Monday; dates are local "YYYY-MM-DD" strings.
 */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const WEEKDAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const

export interface DayAvailability {
  /** true = available, false = not available, null = unknown */
  available: boolean | null
  /** "HH:MM" when available */
  start: string | null
  /** Where it comes from: a habit, an exception for that date, or nothing */
  source: 'habit' | 'exception' | 'none'
}

export interface PlanningPlayer {
  id: number
  name: string
  role: string
  status: 'starter' | 'sub'
  /** weekday (0 = Monday) → usual start time */
  habits: Record<number, string>
  /** date → exception */
  exceptions: Record<string, { available: boolean, start: string | null }>
}

export interface PlanningWeek {
  /** Monday of the week */
  week: string
  days: string[]
  defaultTime: string
  players: PlanningPlayer[]
}

const pad = (n: number) => String(n).padStart(2, '0')
export const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromIsoDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

/** Monday of the week containing `date`. */
export function mondayOf(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return toIsoDate(d)
}

export function addDays(iso: string, days: number): string {
  const d = fromIsoDate(iso)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i))
/** 0 = Monday … 6 = Sunday */
export const weekdayOf = (iso: string) => (fromIsoDate(iso).getDay() + 6) % 7

export function availabilityOn(player: PlanningPlayer, date: string): DayAvailability {
  const exception = player.exceptions[date]
  if (exception) return { available: exception.available, start: exception.available ? exception.start : null, source: 'exception' }
  const habit = player.habits[weekdayOf(date)]
  if (habit) return { available: true, start: habit, source: 'habit' }
  return { available: null, start: null, source: 'none' }
}

export interface DaySummary {
  date: string
  available: PlanningPlayer[]
  missing: PlanningPlayer[]
  /** Starting five all available */
  fullRoster: boolean
  /** Latest start among available starters: when everyone can play */
  commonStart: string | null
}

/** Who among the starters can play that day, and from when. */
export function summarizeDay(players: PlanningPlayer[], date: string): DaySummary {
  const starters = players.filter(p => p.status === 'starter')
  const available = starters.filter(p => availabilityOn(p, date).available === true)
  const missing = starters.filter(p => availabilityOn(p, date).available !== true)
  const starts = available.map(p => availabilityOn(p, date).start).filter((s): s is string => !!s).sort()
  return {
    date,
    available,
    missing,
    fullRoster: starters.length >= 5 && !missing.length,
    commonStart: starts.at(-1) ?? null,
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
export const isTime = (s: unknown): s is string => typeof s === 'string' && HHMM.test(s)
export const isIsoDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
