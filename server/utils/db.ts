import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import type { Game, Series } from '#shared/types'

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
