import { timingSafeEqual } from 'node:crypto'
import { authEnabled, authSession } from '../../utils/auth'

/** Après 5 erreurs, une adresse attend une minute : un mot de passe ne se devine pas à coups d'essais. */
const MAX_FAILS = 5
const LOCK_MS = 60_000
const fails = new Map<string, { n: number, until: number }>()

export default defineEventHandler(async (event) => {
  if (!authEnabled()) return { ok: true }
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'inconnue'
  const state = fails.get(ip)
  if (state && state.until > Date.now()) {
    throw createError({ statusCode: 429, statusMessage: 'Trop d’essais : réessaie dans une minute' })
  }

  const { password } = await readBody(event) ?? {}
  const a = Buffer.from(String(password ?? ''))
  const b = Buffer.from(process.env.SITE_PASSWORD!)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    const n = (state?.n ?? 0) + 1
    fails.set(ip, n >= MAX_FAILS ? { n: 0, until: Date.now() + LOCK_MS } : { n, until: 0 })
    throw createError({ statusCode: 401, statusMessage: 'Mot de passe incorrect' })
  }

  fails.delete(ip)
  await (await authSession(event)).update({ ok: true })
  return { ok: true }
})
