import type { FearlessMode, SeriesFormat, Side } from './draft'

export interface Champion {
  /** Data Dragon id, e.g. "MonkeyKing" */
  id: string
  /** Numeric id used by Match-V5 (`championId`) */
  key: number
  name: string
  tags: string[]
}

export interface ChampionsResponse {
  version: string
  champions: Champion[]
}

export interface Series {
  id: number
  name: string
  opponent: string
  format: SeriesFormat
  fearless: FearlessMode
  createdAt: string
  gameCount?: number
}

export interface Game {
  id: number
  seriesId: number
  n: number
  ourSide: Side
  actions: string[]
  winner: Side | null
}

export interface SeriesDetail {
  series: Series
  games: Game[]
}
