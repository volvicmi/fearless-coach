import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { ROLES } from '#shared/types'
import type { Game, Player, PoolEntry, Series } from '#shared/types'

let db: DatabaseSync | undefined

export function useDb(): DatabaseSync {
  if (db) return db
  mkdirSync('data', { recursive: true })
  db = new DatabaseSync('data/coach.db')
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS series (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      opponent   TEXT NOT NULL DEFAULT '',
      format     TEXT NOT NULL CHECK (format IN ('Bo1','Bo3','Bo5')),
      fearless   TEXT NOT NULL CHECK (fearless IN ('hard','soft','off')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS games (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
      n         INTEGER NOT NULL,
      our_side  TEXT NOT NULL CHECK (our_side IN ('blue','red')),
      actions   TEXT NOT NULL DEFAULT '[]',
      winner    TEXT CHECK (winner IN ('blue','red')),
      UNIQUE (series_id, n)
    );
    CREATE TABLE IF NOT EXISTS players (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      name    TEXT NOT NULL,
      role    TEXT NOT NULL CHECK (role IN ('top','jungle','mid','adc','support')),
      riot_id TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS pool_entries (
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      champ_id  TEXT NOT NULL,
      tier      TEXT NOT NULL CHECK (tier IN ('S','A','B','C')),
      note      TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (player_id, champ_id)
    );
  `)
  return db
}

export function toSeries(row: any): Series {
  return {
    id: row.id,
    name: row.name,
    opponent: row.opponent,
    format: row.format,
    fearless: row.fearless,
    createdAt: row.created_at,
    gameCount: row.game_count ?? undefined,
  }
}

/** All players with their pools, ordered by role then name. */
export function loadTeam(): Player[] {
  const db = useDb()
  const players = db.prepare('SELECT * FROM players').all() as any[]
  const entries = db.prepare('SELECT * FROM pool_entries ORDER BY tier, champ_id').all() as any[]
  const pools = new Map<number, PoolEntry[]>()
  for (const e of entries) {
    const list = pools.get(e.player_id) ?? []
    list.push({ champId: e.champ_id, tier: e.tier, note: e.note })
    pools.set(e.player_id, list)
  }
  return players
    .map(p => ({ id: p.id, name: p.name, role: p.role, riotId: p.riot_id, pool: pools.get(p.id) ?? [] }))
    .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.name.localeCompare(b.name))
}

export function toGame(row: any): Game {
  return {
    id: row.id,
    seriesId: row.series_id,
    n: row.n,
    ourSide: row.our_side,
    actions: JSON.parse(row.actions),
    winner: row.winner,
  }
}
