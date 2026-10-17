import type { Champion, ChampionsResponse } from '#shared/types'

const BASE = 'https://ddragon.leagueoflegends.com'
const TTL_MS = 6 * 60 * 60 * 1000

let cache: { data: ChampionsResponse; fetchedAt: number } | undefined

/** Latest patch champion list from Data Dragon, cached in memory for 6 hours. */
export async function getChampions(): Promise<ChampionsResponse> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.data
  try {
    const [version] = await $fetch<string[]>(`${BASE}/api/versions.json`)
    const res = await $fetch<{ data: Record<string, any> }>(`${BASE}/cdn/${version}/data/en_US/champion.json`)
    const champions: Champion[] = Object.values(res.data)
      .map(c => ({ id: c.id, key: Number(c.key), name: c.name, tags: c.tags }))
      .sort((a, b) => a.name.localeCompare(b.name))
    cache = { data: { version: version!, champions }, fetchedAt: Date.now() }
    return cache.data
  }
  catch (err) {
    if (cache) return cache.data // serve stale data rather than break a live draft
    throw createError({ statusCode: 502, statusMessage: 'Data Dragon injoignable', cause: err })
  }
}
