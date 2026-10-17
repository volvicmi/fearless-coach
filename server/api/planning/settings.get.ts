import { DEFAULT_TIME } from '../../utils/planning'

/** Planning settings. The webhook itself is never sent back, only whether one is set. */
export default defineEventHandler(() => ({
  defaultTime: getSetting('planningDefaultTime') || DEFAULT_TIME,
  publicUrl: getSetting('planningPublicUrl'),
  hasWebhook: !!getSetting('discordWebhook'),
  reminderDay: getSetting('reminderDay') || 'off',
  reminderHour: Number(getSetting('reminderHour') || 18),
  lastReminder: getSetting('lastReminderWeek'),
}))
