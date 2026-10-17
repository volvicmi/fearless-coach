import { isTime } from '#shared/planning'
import { isDiscordWebhook } from '../../utils/planning'

/** Partial update: defaultTime, publicUrl, webhook ("" removes it), reminderDay (off|monday|sunday), reminderHour (0-23). */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) ?? {}
  if (body.defaultTime !== undefined) {
    if (!isTime(body.defaultTime)) throw createError({ statusCode: 400, statusMessage: 'Heure invalide' })
    setSetting('planningDefaultTime', body.defaultTime)
  }
  if (body.publicUrl !== undefined) setSetting('planningPublicUrl', String(body.publicUrl).trim())
  if (body.webhook !== undefined) {
    const url = String(body.webhook).trim()
    if (url && !isDiscordWebhook(url)) throw createError({ statusCode: 400, statusMessage: 'Ce n’est pas une URL de webhook Discord' })
    setSetting('discordWebhook', url)
  }
  if (body.reminderDay !== undefined) {
    if (!['off', 'monday', 'sunday'].includes(body.reminderDay)) throw createError({ statusCode: 400, statusMessage: 'Jour de rappel invalide' })
    setSetting('reminderDay', body.reminderDay)
  }
  if (body.reminderHour !== undefined) {
    const hour = Number(body.reminderHour)
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw createError({ statusCode: 400, statusMessage: 'Heure invalide' })
    setSetting('reminderHour', String(hour))
  }
  return { ok: true }
})
