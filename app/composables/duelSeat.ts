/**
 * The seat token of this browser for a duel (localStorage). It's sent with every write, so the server knows
 * which side this browser may play. A browser with no token is a spectator.
 */
const tokenKey = (seriesId: number | string) => `duel-token-${seriesId}`

export function duelToken(seriesId: number | string): string {
  try { return localStorage.getItem(tokenKey(seriesId)) ?? '' }
  catch { return '' }
}

export function saveDuelToken(seriesId: number | string, token: string) {
  try { localStorage.setItem(tokenKey(seriesId), token) }
  catch {}
}

/** Headers for a request on a duel: empty outside the browser (SSR) or for a spectator. */
export function duelHeaders(seriesId: number | string): Record<string, string> {
  if (!import.meta.client) return {}
  const token = duelToken(seriesId)
  return token ? { 'x-duel-token': token } : {}
}
