import type { H3Event } from 'h3'
import { getRequestURL, useSession } from 'h3'

/**
 * Le mot de passe commun de l'équipe n'est exigé que s'il est défini (SITE_PASSWORD) :
 * en local, sans lui, le site reste ouvert comme avant. En ligne, il est obligatoire.
 */
export const authEnabled = () => !!process.env.SITE_PASSWORD

/** Cookie de session signé : la clé NUXT_SESSION_PASSWORD (32 caractères minimum) est distincte du mot de passe du site. */
export function authSession(event: H3Event) {
  const password = process.env.NUXT_SESSION_PASSWORD
  if (!password || password.length < 32) {
    throw createError({ statusCode: 503, statusMessage: 'Protection du site mal configurée : NUXT_SESSION_PASSWORD (32 caractères minimum) est requis avec SITE_PASSWORD' })
  }
  const secure = getRequestURL(event, { xForwardedProto: true }).protocol === 'https:'
  return useSession<{ ok?: boolean }>(event, {
    name: 'fc-session',
    password,
    maxAge: 60 * 60 * 24 * 30,
    cookie: { httpOnly: true, sameSite: 'lax', secure, path: '/' },
  })
}
