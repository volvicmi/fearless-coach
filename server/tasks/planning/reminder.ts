import { loadPlanning, postToDiscord, reminderWeek, weekMessage } from '../../utils/planning'

/**
 * Runs every 15 minutes (see nuxt.config): on the chosen day, from the chosen hour, posts the week
 * summary to Discord once. Only while the app is running.
 */
export default defineTask({
  meta: { name: 'planning:reminder', description: 'Weekly availability reminder on Discord' },
  async run() {
    const day = getSetting('reminderDay')
    if (!day || day === 'off' || !getSetting('discordWebhook')) return { result: 'disabled' }

    const now = new Date()
    const today = now.getDay() === 0 ? 'sunday' : now.getDay() === 1 ? 'monday' : ''
    if (today !== day || now.getHours() < Number(getSetting('reminderHour') || 18)) return { result: 'not now' }

    const week = reminderWeek(now)
    if (getSetting('lastReminderWeek') === week) return { result: 'already sent' }

    await postToDiscord(weekMessage(loadPlanning(week)))
    setSetting('lastReminderWeek', week)
    return { result: `sent for ${week}` }
  },
})
