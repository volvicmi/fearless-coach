import { authEnabled, authSession } from '../utils/auth'

/** Pages et fichiers qui restent publics : la connexion, la synchro drafter.lol (protégée par son propre jeton) et les fichiers de l'application. */
const PUBLIC = ['/api/auth/', '/api/sync/', '/_nuxt/', '/__', '/@', '/node_modules/', '/favicon', '/_ipx/']

/** Tout le site (pages et API) demande le mot de passe de l'équipe dès qu'il est configuré. */
export default defineEventHandler(async (event) => {
  if (!authEnabled()) return
  const path = event.path.split('?')[0]!
  if (path === '/login' || PUBLIC.some(p => path.startsWith(p))) return

  const { data } = await authSession(event)
  if (data.ok) return

  if (path.startsWith('/api/')) throw createError({ statusCode: 401, statusMessage: 'Connexion requise' })
  return sendRedirect(event, '/login', 302)
})
