import { authEnabled, authSession } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  if (authEnabled()) await (await authSession(event)).clear()
  return { ok: true }
})
