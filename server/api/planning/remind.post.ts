import { loadPlanning, postToDiscord, reminderWeek, weekMessage } from '../../utils/planning'

/** Sends the week summary to Discord now (the "Send now" button): `{ week? }`, the reminder's week by default. */
export default defineEventHandler(async (event) => {
  const { week } = await readBody(event) ?? {}
  const message = weekMessage(loadPlanning(typeof week === 'string' ? week : reminderWeek()))
  await postToDiscord(message)
  return { ok: true, message }
})
