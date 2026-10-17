import { ofetch } from 'ofetch'
import { ROLES } from '#shared/types'
import { WEEKDAYS_FR, addDays, fromIsoDate, mondayOf, summarizeDay, weekDays } from '#shared/planning'
import type { PlanningPlayer, PlanningWeek } from '#shared/planning'

export const DEFAULT_TIME = '21:00'

export function loadPlanning(week: string): PlanningWeek {
  const db = useDb()
  const days = weekDays(week)
  const players = db.prepare('SELECT id, name, role, status FROM players').all() as any[]
  const habits = db.prepare('SELECT * FROM availability_habits').all() as any[]
  const exceptions = db.prepare('SELECT * FROM availability_exceptions WHERE date BETWEEN ? AND ?').all(days[0]!, days[6]!) as any[]

  const list: PlanningPlayer[] = players.map(p => ({
    id: p.id,
    name: p.name,
    role: p.role,
    status: p.status,
    habits: Object.fromEntries(habits.filter(h => h.player_id === p.id).map(h => [h.weekday, h.start])),
    exceptions: Object.fromEntries(exceptions.filter(e => e.player_id === p.id).map(e => [e.date, { available: !!e.available, start: e.start }])),
  }))
  list.sort((a, b) => (a.status === b.status ? 0 : a.status === 'starter' ? -1 : 1)
    || ROLES.indexOf(a.role as any) - ROLES.indexOf(b.role as any) || a.name.localeCompare(b.name))

  return { week, days, defaultTime: getSetting('planningDefaultTime') || DEFAULT_TIME, players: list }
}

const shortDate = (iso: string) => {
  const d = fromIsoDate(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** The Discord message for a week: one line per day with the starting five's status. */
export function weekMessage(planning: PlanningWeek): string {
  const lines = planning.days.map((date, i) => {
    const day = summarizeDay(planning.players, date)
    const starters = day.available.length + day.missing.length
    const head = `**${WEEKDAYS_FR[i]} ${shortDate(date)}**`
    if (!starters) return `${head} : aucun titulaire`
    if (day.fullRoster) return `${head} : ✅ ${day.available.length}/${starters}${day.commonStart ? ` dès ${day.commonStart}` : ''}`
    const missing = day.missing.map(p => p.name).join(', ')
    return `${head} : ${day.available.length >= starters - 1 ? '⚠️' : '❌'} ${day.available.length}/${starters} · manque ${missing}`
  })
  const url = getSetting('planningPublicUrl')
  return [
    `📅 **Dispos de la semaine du ${shortDate(planning.week)}**`,
    ...lines,
    url ? `\nMettez vos dispos à jour : ${url}` : '\nPensez à mettre vos dispos à jour 🙏',
  ].join('\n')
}

export function isDiscordWebhook(url: string): boolean {
  return /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url)
}

export async function postToDiscord(content: string) {
  const webhook = getSetting('discordWebhook')
  if (!webhook) throw createError({ statusCode: 400, statusMessage: 'No Discord webhook configured' })
  try {
    await ofetch(webhook, { method: 'POST', body: { content, username: 'Fearless Coach' } })
  }
  catch (err: any) {
    throw createError({ statusCode: 502, statusMessage: `Discord refused the message (${err?.statusCode ?? 'network'})` })
  }
}

/** The week the reminder talks about: next week when sent on Sunday, this week otherwise. */
export function reminderWeek(now = new Date()): string {
  const monday = mondayOf(now)
  return now.getDay() === 0 ? addDays(monday, 7) : monday
}
