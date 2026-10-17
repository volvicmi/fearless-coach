import type { Role, SoloqChamp, SoloqSummary, SyncStatus } from '#shared/types'

const POSITION_TO_ROLE: Record<string, Role> = {
  TOP: 'top',
  JUNGLE: 'jungle',
  MIDDLE: 'mid',
  BOTTOM: 'adc',
  UTILITY: 'support',
}
const REMAKE_S = 300
const DAY_MS = 24 * 60 * 60 * 1000

/** Compact participant stored in riot_matches (all 10 players, so teammates synced later reuse it). */
interface StoredParticipant {
  puuid: string
  c: number // championId
  t: number // teamId
  p: string // teamPosition
  w: boolean
  k: number
  d: number
  a: number
  cs: number
}

const jobs = new Map<number, SyncStatus>()

export function syncStatus(playerId: number): SyncStatus {
  return jobs.get(playerId) ?? { state: 'idle', done: 0, total: 0 }
}

/** Starts a background sync (or returns the running one). Poll syncStatus() for progress. */
export function startSync(playerId: number): SyncStatus {
  const current = jobs.get(playerId)
  if (current?.state === 'running') return current
  const status: SyncStatus = { state: 'running', done: 0, total: 0, message: 'Looking up the Riot account…' }
  jobs.set(playerId, status)
  runSync(playerId, status).catch((err) => {
    status.state = 'error'
    status.message = err?.statusMessage ?? err?.message ?? 'Sync failed'
  })
  return status
}

async function runSync(playerId: number, status: SyncStatus) {
  const db = useDb()
  const player = db.prepare('SELECT riot_id FROM players WHERE id = ?').get(playerId) as { riot_id: string } | undefined
  if (!player) throw createError({ statusCode: 404, statusMessage: 'player not found' })
  const [gameName, tagLine] = player.riot_id.split('#').map(s => s.trim())
  if (!gameName || !tagLine) throw createError({ statusCode: 400, statusMessage: 'Set the Riot ID as Name#TAG first' })

  const { region } = riotHosts()
  const account = await riotGet<{ puuid: string }>(
    region, `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`)
  db.prepare('UPDATE players SET puuid = ? WHERE id = ?').run(account.puuid, playerId)

  status.message = 'Listing ranked games…'
  const { riotMatchCount } = useRuntimeConfig()
  const ids = await riotGet<string[]>(region, `/lol/match/v5/matches/by-puuid/${account.puuid}/ids`, {
    type: 'ranked', // SoloQ + Flex
    start: 0,
    count: Math.min(100, Number(riotMatchCount) || 60),
  })

  const known = new Set((db.prepare('SELECT match_id FROM player_games WHERE puuid = ?').all(account.puuid) as { match_id: string }[]).map(r => r.match_id))
  const todo = ids.filter(id => !known.has(id))
  status.total = todo.length
  status.message = todo.length ? `Fetching ${todo.length} new games…` : 'Already up to date'

  const { champions } = await getChampions()
  const idByKey = new Map(champions.map(c => [c.key, c.id]))
  const cached = db.prepare('SELECT * FROM riot_matches WHERE match_id = ?')
  const storeMatch = db.prepare('INSERT OR IGNORE INTO riot_matches (match_id, queue_id, played_at, duration_s, participants) VALUES (?, ?, ?, ?, ?)')
  const storeGame = db.prepare(`
    INSERT OR IGNORE INTO player_games
      (puuid, match_id, queue_id, champ_id, role, win, kills, deaths, assists, cs, duration_s, played_at, enemy_champ_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)

  for (const matchId of todo) {
    let row = cached.get(matchId) as any
    if (!row) {
      const m = await riotGet<RiotMatch>(region, `/lol/match/v5/matches/${matchId}`)
      const participants: StoredParticipant[] = m.info.participants.map(p => ({
        puuid: p.puuid,
        c: p.championId,
        t: p.teamId,
        p: p.teamPosition,
        w: p.win,
        k: p.kills,
        d: p.deaths,
        a: p.assists,
        cs: p.totalMinionsKilled + p.neutralMinionsKilled,
      }))
      row = { match_id: matchId, queue_id: m.info.queueId, played_at: m.info.gameEndTimestamp, duration_s: m.info.gameDuration, participants: JSON.stringify(participants) }
      storeMatch.run(row.match_id, row.queue_id, row.played_at, row.duration_s, row.participants)
    }

    const participants = JSON.parse(row.participants) as StoredParticipant[]
    const me = participants.find(p => p.puuid === account.puuid)
    if (me && row.duration_s >= REMAKE_S) {
      const enemy = me.p ? participants.find(p => p.t !== me.t && p.p === me.p) : undefined
      storeGame.run(
        account.puuid, matchId, row.queue_id,
        idByKey.get(me.c) ?? String(me.c), POSITION_TO_ROLE[me.p] ?? null,
        me.w ? 1 : 0, me.k, me.d, me.a, me.cs, row.duration_s, row.played_at,
        enemy ? idByKey.get(enemy.c) ?? null : null,
      )
    }
    status.done++
  }

  db.prepare("UPDATE players SET soloq_synced_at = datetime('now') WHERE id = ?").run(playerId)
  status.state = 'done'
  status.message = todo.length ? `${todo.length} new game(s) imported` : 'Already up to date'
}

/** Per-champion ranked stats for one player, most played first. */
export function loadSoloq(puuid: string, syncedAt: string | null): SoloqSummary | null {
  if (!puuid) return null
  const rows = useDb().prepare('SELECT * FROM player_games WHERE puuid = ? ORDER BY played_at DESC').all(puuid) as any[]
  const now = Date.now()
  const byChamp = new Map<string, SoloqChamp & { seconds: number, cs: number, roles: Map<Role, number> }>()

  for (const r of rows) {
    let c = byChamp.get(r.champ_id)
    if (!c) {
      c = { champId: r.champ_id, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, csPerMin: 0, recent: 0, lastPlayed: r.played_at, role: null, seconds: 0, cs: 0, roles: new Map() }
      byChamp.set(r.champ_id, c)
    }
    c.games++
    c.wins += r.win
    c.kills += r.kills
    c.deaths += r.deaths
    c.assists += r.assists
    c.cs += r.cs
    c.seconds += r.duration_s
    if (now - r.played_at < 30 * DAY_MS) c.recent++
    if (r.role) c.roles.set(r.role, (c.roles.get(r.role) ?? 0) + 1)
  }

  const champions = [...byChamp.values()]
    .map(({ seconds, cs, roles, ...c }) => ({
      ...c,
      csPerMin: seconds ? Math.round((cs / (seconds / 60)) * 10) / 10 : 0,
      role: [...roles].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    }))
    .sort((a, b) => b.games - a.games || b.lastPlayed - a.lastPlayed)

  return {
    syncedAt,
    games: rows.length,
    wins: rows.reduce((n, r) => n + r.win, 0),
    champions,
  }
}
