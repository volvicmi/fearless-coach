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

/** S = best comfort, C = situational / pocket pick, P = practice (being trained, not ready for official games) */
export const TIERS = ['S', 'A', 'B', 'C', 'P'] as const
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
  /** The data-based estimate the AI started from (blue %, factors) */
  data: { blue: number, factors: { label: string, detail: string, impact: number }[] }
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

/** One champion in a player's ranked history (SoloQ + Flex). */
export interface SoloqChamp {
  champId: string
  games: number
  wins: number
  kills: number
  deaths: number
  assists: number
  csPerMin: number
  /** Games in the last 30 days */
  recent: number
  /** epoch ms */
  lastPlayed: number
  /** Most played position on this champion, if Riot reported one */
  role: Role | null
}

export interface RankedStats {
  games: number
  wins: number
  /** Most played first */
  champions: SoloqChamp[]
}

/** All ranked games (SoloQ + Flex), plus each queue apart. */
export interface SoloqSummary extends RankedStats {
  syncedAt: string | null
  solo: RankedStats
  flex: RankedStats
}

export interface Player {
  id: number
  name: string
  role: Role
  /** "GameName#TAG" */
  riotId: string
  /** Starting five or substitute */
  status: 'starter' | 'sub'
  pool: PoolEntry[]
  /** null until the first Riot sync */
  soloq: SoloqSummary | null
}

/** A practised combo: one champion and the partners that go with it (Jhin + Shen / Camille / Alistar). */
export interface Combo {
  id: number
  anchor: string
  partners: string[]
  note: string
}

/** Draft style of a prepared scenario (stored in the `color` column). */
export const SCENARIO_COLORS = ['engage', 'poke', 'front-to-back'] as const
export type ScenarioColor = typeof SCENARIO_COLORS[number]

/** A draft prepared in advance; every step can hold several alternatives (first = main choice). */
export interface PrepScenario {
  id: number
  prepId: number
  name: string
  color: ScenarioColor
  ourSide: 'blue' | 'red'
  /** 20 entries, one per DRAFT_ORDER step */
  slots: string[][]
  notes: string
  position: number
}

export interface Prep {
  id: number
  name: string
  opponent: string
  createdAt: string
  scenarioCount?: number
  /** Light copy of the drafts, for previews in the prep list */
  scenarios?: Pick<PrepScenario, 'id' | 'name' | 'color' | 'ourSide' | 'slots'>[]
}

export interface PrepDetail {
  prep: Prep
  scenarios: PrepScenario[]
}

export interface ProChampStat {
  champId: string
  picks: number
  bans: number
  wins: number
  losses: number
  /** gol.gg priority score (bans and early picks weigh more) */
  prio: number
  /** Average pick round (1 = first rotation) */
  avgRound: number
  /** % of picks made blind */
  blindPct: number
  /** (picks + bans) / games, 0-1 */
  presence: number
  /** wins / picks, 0-1 */
  winRate: number
}

export interface ProMeta {
  games: number
  /** Most present first */
  champions: ProChampStat[]
}

export interface ProTournament {
  name: string
  syncedAt: string | null
  series: number
  games: number
}

/** One real pro game: actions follow DRAFT_ORDER, like our own games. */
export interface ProDraft {
  tournament: string
  date: string
  patch: string
  blueTeam: string
  redTeam: string
  winner: 'blue' | 'red'
  actions: string[]
}

export interface SyncStatus {
  state: 'idle' | 'running' | 'done' | 'error'
  done: number
  total: number
  message?: string
}
