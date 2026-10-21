import { authEnabled, authSession } from '../../utils/auth'

/** `enabled` est faux quand aucun mot de passe n'est configuré (local) ; `loggedIn` dit si ce navigateur est connecté. */
export default defineEventHandler(async (event) => {
  if (!authEnabled()) return { enabled: false, loggedIn: false }
  const { data } = await authSession(event)
  return { enabled: true, loggedIn: !!data.ok }
})
