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

export const ROLES = ['top', 'jungle', 'mid', 'adc', 'support'] as const
export type Role = typeof ROLES[number]

/** S = best comfort, C = situational / pocket pick */
export const TIERS = ['S', 'A', 'B', 'C'] as const
export type Tier = typeof TIERS[number]

export interface PoolEntry {
  champId: string
  tier: Tier
  note: string
}

/** advice = our turn, prediction = their turn, review = draft complete */
export type CoachMode = 'advice' | 'prediction' | 'review'

export interface CompReview {
  /** Estimated win chance from the draft alone, 0-100 (blue + red = 100) */
  winRate: number
  archetype: string
  winConditions: string[]
  powerSpikes: string
  gamePlan: string
  /** How the other team beats this comp */
  howToCounter: string[]
}

export interface CoachReview {
  kind: 'review'
  blue: CompReview
  red: CompReview
  verdict: string
  model: string
  ms: number
}

export type CoachResult = CoachAdvice | CoachReview

export interface CoachAdvice {
  kind: 'advice' | 'prediction'
  /** e.g. "Our pick 2" */
  step: string
  recommendations: { champId: string, player: string | null, confidence: 'high' | 'medium' | 'low', reason: string }[]
  enemyRead: string
  plan: string
  warnings: string[]
  model: string
  ms: number
}

export interface Player {
  id: number
  name: string
  role: Role
  /** "GameName#TAG", for the Riot API import later */
  riotId: string
  pool: PoolEntry[]
}
