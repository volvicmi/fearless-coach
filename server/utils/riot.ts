import { FetchError, ofetch } from 'ofetch'

/**
 * Minimal Riot API client.
 * Development keys allow 20 requests / 1 s and 100 requests / 2 min: we stay just under both.
 */
const WINDOWS = [
  { ms: 1_000, max: 18 },
  { ms: 120_000, max: 95 },
]
const sent: number[] = []
let queue: Promise<unknown> = Promise.resolve()

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function waitForSlot() {
  for (;;) {
    const now = Date.now()
    while (sent.length && now - sent[0]! > 120_000) sent.shift()
    const wait = Math.max(0, ...WINDOWS.map(({ ms, max }) => {
      const inWindow = sent.filter(t => now - t < ms)
      return inWindow.length < max ? 0 : inWindow[0]! + ms - now + 50
    }))
    if (!wait) break
    await sleep(wait)
  }
  sent.push(Date.now())
}

function apiKey(): string {
  const key = process.env.RIOT_API_KEY
  if (!key) throw createError({ statusCode: 503, statusMessage: 'RIOT_API_KEY manquante : ajoute-la dans .env et redémarre le serveur' })
  return key
}

/** Requests run one at a time through the rate limiter; 429s are retried after Retry-After. */
export function riotGet<T>(host: string, path: string, query?: Record<string, string | number>): Promise<T> {
  const run = async (): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      await waitForSlot()
      try {
        return await ofetch<T>(`https://${host}.api.riotgames.com${path}`, {
          query,
          headers: { 'X-Riot-Token': apiKey() },
        })
      }
      catch (err) {
        if (!(err instanceof FetchError)) throw err
        const status = err.statusCode ?? 0
        if (status === 429 && attempt < 3) {
          await sleep((Number(err.response?.headers.get('retry-after')) || 5) * 1000)
          continue
        }
        if (status === 401 || status === 403) {
          throw createError({ statusCode: 503, statusMessage: 'Clé API Riot refusée : les clés de développement expirent toutes les 24 h, génères-en une nouvelle sur developer.riotgames.com' })
        }
        if (status === 404) throw createError({ statusCode: 404, statusMessage: 'Introuvable sur l’API Riot' })
        throw createError({ statusCode: 502, statusMessage: `Erreur de l’API Riot ${status || ''}`.trim() })
      }
    }
  }
  const result = queue.then(run, run)
  queue = result.catch(() => {})
  return result
}

export interface RiotParticipant {
  puuid: string
  championId: number
  teamId: number
  teamPosition: string
  win: boolean
  kills: number
  deaths: number
  assists: number
  totalMinionsKilled: number
  neutralMinionsKilled: number
}

export interface RiotMatch {
  metadata: { matchId: string }
  info: {
    queueId: number
    gameDuration: number
    gameEndTimestamp: number
    participants: RiotParticipant[]
  }
}

export function riotHosts() {
  const { riotPlatform, riotRegion } = useRuntimeConfig()
  return { platform: String(riotPlatform), region: String(riotRegion) }
}
