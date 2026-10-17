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
      tier      TEXT NOT NULL CHECK (tier IN ('S','A','B','C','P')),
      note      TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (player_id, champ_id)
    );
    -- 'soft' Fearless was dropped: there is only one Fearless rule.
    UPDATE series SET fearless = 'hard' WHERE fearless = 'soft';

    -- Riot API cache: finished matches never change, so they are fetched once.
    CREATE TABLE IF NOT EXISTS riot_matches (
      match_id     TEXT PRIMARY KEY,
      queue_id     INTEGER NOT NULL,
      played_at    INTEGER NOT NULL,
      duration_s   INTEGER NOT NULL,
      participants TEXT NOT NULL
    );
    -- One row per (player, ranked game), derived from riot_matches.
    CREATE TABLE IF NOT EXISTS player_games (
      puuid          TEXT NOT NULL,
      match_id       TEXT NOT NULL,
      queue_id       INTEGER NOT NULL,
      champ_id       TEXT NOT NULL,
      role           TEXT,
      win            INTEGER NOT NULL,
      kills          INTEGER NOT NULL,
      deaths         INTEGER NOT NULL,
      assists        INTEGER NOT NULL,
      cs             INTEGER NOT NULL,
      duration_s     INTEGER NOT NULL,
      played_at      INTEGER NOT NULL,
      enemy_champ_id TEXT,
      PRIMARY KEY (puuid, match_id)
    );
  `)
  addColumn(db, 'players', 'puuid', "TEXT NOT NULL DEFAULT ''")
  addColumn(db, 'players', 'soloq_synced_at', 'TEXT')
  allowPracticeTier(db)
  return db
}

/** Databases created before the Practice tier have a CHECK without 'P': SQLite can't alter it, so rebuild the table. */
function allowPracticeTier(db: DatabaseSync) {
  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pool_entries'").get() as { sql: string }
  if (sql.includes("'P'")) return
  db.exec(`
    BEGIN;
    CREATE TABLE pool_entries_new (
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      champ_id  TEXT NOT NULL,
      tier      TEXT NOT NULL CHECK (tier IN ('S','A','B','C','P')),
      note      TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (player_id, champ_id)
    );
    INSERT INTO pool_entries_new (player_id, champ_id, tier, note) SELECT player_id, champ_id, tier, note FROM pool_entries;
    DROP TABLE pool_entries;
    ALTER TABLE pool_entries_new RENAME TO pool_entries;
    COMMIT;
  `)
}

/** SQLite has no ADD COLUMN IF NOT EXISTS. */
function addColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!columns.some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
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
    .map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      riotId: p.riot_id,
      pool: pools.get(p.id) ?? [],
      soloq: loadSoloq(p.puuid, p.soloq_synced_at),
    }))
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
