import { ofetch } from 'ofetch'
import { DRAFT_ORDER, NO_BAN, slotsOf } from '#shared/draft'
import type { Side } from '#shared/draft'
import type { Champion, ProChampStat, ProDraft, ProMeta, ProTournament, SyncStatus } from '#shared/types'

/**
 * Pro data from gol.gg: champion stats and real drafts per tournament.
 * Polite scraping: one request per second, results cached in the database (finished series never change).
 */
const BASE = 'https://gol.gg'
const USER_AGENT = 'FearlessCoach/1.0 (personal LoL draft tool; one request per second)'
const DEFAULT_TOURNAMENTS = ['LCK Cup 2026', 'LEC 2026 Spring Season']

let lastRequest = 0
async function fetchPage(path: string): Promise<string> {
  const wait = lastRequest + 1000 - Date.now()
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequest = Date.now()
  try {
    return await ofetch(`${BASE}${path}`, { responseType: 'text', headers: { 'User-Agent': USER_AGENT } })
  }
  catch (err: any) {
    throw createError({ statusCode: 502, statusMessage: `gol.gg injoignable (${err?.statusCode ?? 'réseau'}) pour ${path}` })
  }
}

const enc = (name: string) => encodeURIComponent(name)
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** gol.gg icon names are mostly Data Dragon ids ("JarvanIV"), sometimes display names ("Wukong", "RenataGlasc"). */
function resolver(champions: Champion[]) {
  const byKey = new Map<string, string>()
  for (const c of champions) {
    byKey.set(normalize(c.id), c.id)
    byKey.set(normalize(c.name), c.id)
  }
  return (raw: string) => byKey.get(normalize(raw))
}

const jobs = new Map<string, SyncStatus>()
export function proSyncStatus(name: string): SyncStatus {
  return jobs.get(name) ?? { state: 'idle', done: 0, total: 0 }
}

export function startProSync(name: string): SyncStatus {
  const current = jobs.get(name)
  if (current?.state === 'running') return current
  const status: SyncStatus = { state: 'running', done: 0, total: 0, message: 'Lecture des stats des champions…' }
  jobs.set(name, status)
  syncTournament(name, status).catch((err) => {
    status.state = 'error'
    status.message = err?.statusMessage ?? err?.message ?? 'Échec de la synchronisation'
  })
  return status
}

async function syncTournament(name: string, status: SyncStatus) {
  const db = useDb()
  const { champions } = await getChampions()
  const resolve = resolver(champions)

  // 1. Champion stats of the whole tournament.
  const listHtml = await fetchPage(`/champion/list/season-ALL/split-ALL/tournament-${enc(name)}/`)
  const stats = parseChampionTable(listHtml, resolve)
  if (!stats.length) throw createError({ statusCode: 404, statusMessage: `Aucune stat de champion sur gol.gg pour « ${name} » : vérifie le nom exact du tournoi` })
  db.exec('BEGIN')
  db.prepare('DELETE FROM pro_champ_stats WHERE tournament = ?').run(name)
  const insertStat = db.prepare(`INSERT INTO pro_champ_stats
    (tournament, champ_id, picks, bans, wins, losses, prio, avg_round, blind_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  for (const s of stats) insertStat.run(name, s.champId, s.picks, s.bans, s.wins, s.losses, s.prio, s.avgRound, s.blindPct)
  db.exec('COMMIT')

  // 2. Series list, then each new series page (it holds every game's draft).
  status.message = 'Liste des séries…'
  const matchHtml = await fetchPage(`/tournament/tournament-matchlist/${enc(name)}/`)
  const series = parseMatchList(matchHtml)
  const known = new Set((db.prepare('SELECT series_id FROM pro_series WHERE tournament = ?').all(name) as { series_id: number }[]).map(r => r.series_id))
  const todo = series.filter(s => !known.has(s.id))
  status.total = todo.length
  status.message = todo.length ? `Lecture de ${todo.length} nouvelle(s) série(s)…` : 'Déjà à jour'

  const insertSeries = db.prepare('INSERT OR IGNORE INTO pro_series (series_id, tournament, date, patch) VALUES (?, ?, ?, ?)')
  const insertGame = db.prepare(`INSERT OR REPLACE INTO pro_games
    (series_id, n, tournament, date, patch, blue_team, red_team, winner, actions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  for (const s of todo) {
    const html = await fetchPage(`/game/stats/${s.id}/page-summary/`)
    const games = parseSeriesPage(html, resolve)
    db.exec('BEGIN')
    games.forEach((g, i) => insertGame.run(s.id, i + 1, name, s.date, s.patch, g.blueTeam, g.redTeam, g.winner, JSON.stringify(g.actions)))
    insertSeries.run(s.id, name, s.date, s.patch)
    db.exec('COMMIT')
    status.done++
  }

  db.prepare(`INSERT INTO pro_tournaments (name, synced_at) VALUES (?, datetime('now'))
    ON CONFLICT (name) DO UPDATE SET synced_at = excluded.synced_at`).run(name)
  status.state = 'done'
  status.message = todo.length ? `${todo.length} nouvelle(s) série(s) importée(s)` : 'Déjà à jour'
}

// ---------- parsing ----------

const cellText = (html: string) => html.replace(/<[^>]+>/g, '').trim()
const num = (s: string | undefined) => Number.parseFloat((s ?? '').replace('%', '')) || 0

function parseChampionTable(html: string, resolve: (raw: string) => string | undefined) {
  const out: Omit<ProChampStat, 'presence' | 'winRate'>[] = []
  for (const row of html.match(/<tr><td[\s\S]*?<\/tr>/g) ?? []) {
    const icon = row.match(/champions_icon\/([^.]+)\.png/)?.[1]
    const champId = icon && resolve(icon)
    if (!champId) continue
    // Columns: Champion, Picks, Bans, PrioScore, Wins, Losses, Winrate, KDA, Avg BT, Avg RP, BP%, …
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => cellText(m[1]!))
    out.push({
      champId,
      picks: num(cells[1]),
      bans: num(cells[2]),
      prio: num(cells[3]),
      wins: num(cells[4]),
      losses: num(cells[5]),
      avgRound: num(cells[9]),
      blindPct: num(cells[10]),
    })
  }
  return out
}

function parseMatchList(html: string) {
  const out: { id: number, patch: string, date: string }[] = []
  for (const m of html.matchAll(/<tr><td class='text-left'><a href='[^']*game\/stats\/(\d+)\/page-summary\/'[\s\S]*?<\/tr>/g)) {
    const cells = [...m[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => cellText(c[1]!))
    out.push({ id: Number(m[1]), patch: cells[5] ?? '', date: cells[6] ?? '' })
  }
  return out
}

interface ParsedGame { blueTeam: string, redTeam: string, winner: Side, actions: string[] }

function parseSeriesPage(html: string, resolve: (raw: string) => string | undefined): ParsedGame[] {
  // Team names in the series header (left, right).
  const teams = [...html.matchAll(/<div class="col-4 col-sm-5 text-center"><h1><a [^>]*>([^<]+)<\/a><\/h1><\/div>/g)].map(m => m[1]!.trim())
  const [leftTeam = 'Team 1', rightTeam = 'Team 2'] = teams
  const games: ParsedGame[] = []

  for (const block of html.split('<div class=\'row pb-1\'>').slice(1)) {
    const cols = block.split(/<div class='col-4 col-sm-(?:5|2)[^']*'>/).slice(1)
    if (cols.length < 3) continue
    const parseSide = (col: string) => {
      const won = /class='text_victory'>WIN/.test(col)
      const [banPart = '', pickPart = ''] = col.split(/<span class='text-uppercase'>Picks<\/span>/)
      const segments = (s: string) => s.split('|').map(seg => [...seg.matchAll(/champions_icon\/([^.]+)\.png/g)].map(m => resolve(m[1]!) ?? m[1]!))
      const pickSegments = segments(pickPart)
      return { won, bans: segments(banPart.split(/Bans<\/span>/)[1] ?? '').flat(), picks: pickSegments.flat(), firstPickGroup: pickSegments[0]?.length ?? 0 }
    }
    const left = parseSide(cols[0]!)
    const right = parseSide(cols[2]!)
    if (left.picks.length !== 5 || right.picks.length !== 5) continue

    // Blue picks alone first (B1 | B2 B3 | B4 B5); red opens with two (R1 R2 | …).
    const leftIsBlue = left.firstPickGroup === 1 || right.firstPickGroup === 2
    const blue = leftIsBlue ? left : right
    const red = leftIsBlue ? right : left
    const actions = DRAFT_ORDER.map((step) => {
      const team = step.side === 'blue' ? blue : red
      return (step.type === 'ban' ? team.bans : team.picks)[step.slot] ?? NO_BAN
    })
    games.push({
      blueTeam: leftIsBlue ? leftTeam : rightTeam,
      redTeam: leftIsBlue ? rightTeam : leftTeam,
      winner: blue.won ? 'blue' : 'red',
      actions,
    })
  }
  return games
}

// ---------- reading ----------

export function listTournaments(): ProTournament[] {
  const db = useDb()
  if (!(db.prepare('SELECT count(*) AS n FROM pro_tournaments').get() as { n: number }).n) {
    const add = db.prepare('INSERT OR IGNORE INTO pro_tournaments (name) VALUES (?)')
    for (const name of DEFAULT_TOURNAMENTS) add.run(name)
  }
  return (db.prepare(`
    SELECT t.name, t.synced_at,
      (SELECT count(*) FROM pro_series s WHERE s.tournament = t.name) AS series,
      (SELECT count(*) FROM pro_games g WHERE g.tournament = t.name) AS games
    FROM pro_tournaments t ORDER BY t.name
  `).all() as any[]).map(r => ({ name: r.name, syncedAt: r.synced_at, series: r.series, games: r.games }))
}

/** Champion stats summed over all imported tournaments, most present first. */
export function loadProMeta(): ProMeta {
  const db = useDb()
  // Every game has 10 picks: the champion table alone gives the number of games, even before the drafts are imported.
  const games = Math.round((db.prepare('SELECT coalesce(sum(picks), 0) AS n FROM pro_champ_stats').get() as { n: number }).n / 10)
  const rows = db.prepare(`
    SELECT champ_id, sum(picks) AS picks, sum(bans) AS bans, sum(wins) AS wins, sum(losses) AS losses,
      max(prio) AS prio, avg(avg_round) AS avg_round, avg(blind_pct) AS blind_pct
    FROM pro_champ_stats GROUP BY champ_id
  `).all() as any[]
  const champions = rows
    .map(r => ({
      champId: r.champ_id,
      picks: r.picks,
      bans: r.bans,
      wins: r.wins,
      losses: r.losses,
      prio: r.prio,
      avgRound: Math.round(r.avg_round * 100) / 100,
      blindPct: Math.round(r.blind_pct),
      presence: games ? Math.min(1, (r.picks + r.bans) / games) : 0,
      winRate: r.picks ? r.wins / r.picks : 0,
    }))
    .sort((a, b) => b.presence - a.presence || b.picks - a.picks)
  return { games, champions }
}

/**
 * Pro drafts closest to a matchup: our champions on one side and theirs on the other (either way round)
 * score highest, then recency. Falls back to the latest drafts when nothing is on the board.
 */
export function loadProMatchups(ours: string[], theirs: string[], limit = 8): ProDraft[] {
  const o = new Set(ours)
  const t = new Set(theirs)
  if (!o.size && !t.size) return loadProDrafts([], limit)
  const count = (g: ProDraft, side: Side, set: Set<string>) => slotsOf(g.actions, side, 'pick').filter(c => !!c && set.has(c)).length
  return loadProDrafts([], 100000)
    .map(g => ({ g, s: Math.max(count(g, 'blue', o) + count(g, 'red', t), count(g, 'red', o) + count(g, 'blue', t)) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => x.g)
}

/** Recent pro drafts, those sharing the most champions with `onBoard` first. */
export function loadProDrafts(onBoard: string[], limit = 12): ProDraft[] {
  const rows = useDb().prepare('SELECT * FROM pro_games ORDER BY date DESC, series_id DESC, n').all() as any[]
  const board = new Set(onBoard)
  const games = rows.map(r => ({
    tournament: r.tournament,
    date: r.date,
    patch: r.patch,
    blueTeam: r.blue_team,
    redTeam: r.red_team,
    winner: r.winner as Side,
    actions: JSON.parse(r.actions) as string[],
  }))
  const shared = (g: ProDraft) => g.actions.filter(a => board.has(a)).length
  return board.size
    ? games.map(g => ({ g, s: shared(g) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map(x => x.g)
    : games.slice(0, limit)
}
