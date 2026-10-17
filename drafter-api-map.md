# drafter.lol Draft Prep — API map

Captured 2026-10-17 from a logged-in session on `/draft-prep/team/[teamId]?view=prep&seriesId=…`.
Read-only capture: no data was modified on drafter.lol.

## Transport

| Piece | Value |
|---|---|
| Frontend | Next.js App Router (`drafter.lol`) |
| Auth | Better-Auth-style session cookie, `GET /api/auth/get-session` |
| Socket token | `POST /draft-prep/socket-auth` (credentials: include) → short-lived token; 401 → redirect to `/signin` |
| Prep socket | **Socket.IO v4**, `https://prep.drafter.lol/draft-prep` (namespace `/draft-prep`), `auth: { token }` |
| Live lobby socket | Socket.IO, `https://socket.drafter.lol/guest` (not captured yet — needs a live lobby) |
| Champion IDs | Data Dragon `id` strings: `MonkeyKing`, `KSante`, `JarvanIV`, `Khazix` |

There is no REST API for prep data: everything is pushed over the socket.

## Client → server events

| Event | Payload |
|---|---|
| `subscribe-team` / `unsubscribe-team` | `teamId` (string) |
| `join-room` / `leave-room` | `roomId` (string) |
| `planner-join-series` | `{ seriesId, userName }` |
| `planner-leave-series` | `seriesId` (string) |
| `planner-request-team-presence` | `{ teamId }` |
| `scouting-queue-request` | `{ teamId }` |
| `planner-cursor-move` | `{ seriesId, x, y }` |
| `planner-cursor-leave` | `{ seriesId }` |
| `planner-cursor-request-colors-state` | `{ seriesId }` |
| `planner-cursor-request-participant-count` | `{ seriesId }` |

Write events (editing scenarios or pools) were not triggered on purpose.

## Server → client events

| Event | Payload |
|---|---|
| `planner-pools-updated` | `{ teamId, pools }` — **~470 KB**, the whole team intel (see below) |
| `planner-series-state` | `{ seriesId, scenarios: Scenario[] }` |
| `planner-series-save-state` / `planner-team-pools-save-state` | `{ seriesId \| teamId, unsavedCount }` |
| `planner-group-notes-updated` | `{ teamId, notes: {} }` |
| `planner-team-presence` | `{ teamId, users: [{ userId, name, image }] }` |
| `scouting-queue-state` | `{ inProgress, position, total, estimatedWaitMs, … }` |
| `scouting-progress-state` | `{ teamId, entries: [] }` |
| `room-joined` | `{ roomID }` |
| `planner-cursor-*` | cursor colors and participant counts (collaboration UI only) |

## Scenario (one draft board)

```ts
interface Scenario {
  id: string; seriesId: string; name: string; order: number
  createdAt: string; updatedAt: string
  data: {
    // key = `${side}-${'ban'|'pick'}-${slot 1..5}-${alternative 1..n}`
    draftState: Record<string, string>        // e.g. "blue-pick-1-2": "MonkeyKing"
    pickSlotCounts: Record<string, number>    // e.g. "blue-pick-2": 4 → 4 alternatives in that slot
    pools: { own: RolePools; enemy: RolePools }
    notes: string
    blueTeamSource: string; redTeamSource: string  // "Your Team" | "Enemy Team"
    enemyTeamId?: string
    gridX: number; gridY: number; cardColor: string
  }
}
type RolePools = Record<'top'|'jungle'|'mid'|'adc'|'support', string[]>
```

A slot holds several **alternatives** (`-1`, `-2`, `-3`): the board is a decision tree, not one draft.

## Team intel (`planner-pools-updated.pools`)

```ts
interface Pools {
  categories: { id: string; name: string; color: string }[]   // "Engage", "Bruiser", "split push"…
  championCategories: Record<PoolEntryKey, string[]>          // entry → category ids
  ownRoleCategories: Record<Role, string[]>                   // category order per role column
  ownTeamWidePrio: PoolEntryKey[]                             // "Pick Prio" column
  customPoolLabels: Record<Role | 'teamWidePrio', string>
  own / ownCustom: RolePools
  ownPlayers: ScoutedPlayer[]
  ownStaff: { id; staffRole; displayName }[]
  enemies: { id; name; pools; customPools; teamWidePrio; roleCategories;
             scoutingPlayers: ScoutedPlayer[]; scoutingLastFetchedAt }[]
}
type PoolEntryKey = `${ChampionId}::entity::${string}`   // e.g. "Khazix::entity::mttzomy3sv0y3mgt"

interface ScoutedPlayer {
  id: string; role: Role; displayName: string; lineupStatus: 'ACTIVE' | string
  gameName: string; tagLine: string; platformRegion: 'euw1'; region: 'europe'
  profileIconId: number; smurfs: unknown[]
  championPool: PoolEntryKey[]
  champions / currentSplitChampions / previousSplitChampions / last30DaysChampions: ChampStats[]
  masteryTopChampions: { championId: number; championLevel: number; championPoints: number }[]
  totalGamesPlayed: number; nextMatchStartIndex: number; lastFetchedAt: string
}
interface ChampStats {
  championName: string; games: number; wins: number; losses: number
  kills: number; deaths: number; assists: number
  kpPercent: number; csPerMin: number; goldPerMin: number
  totalCs: number; totalGoldEarned: number; totalDurationSeconds: number
  totalKpContributions: number; totalTeamKills: number
}
```

## Takeaways for our app

1. **No secret stats engine in draft prep.** "Scouting" is SoloQ data aggregated from Riot Match‑V5 + Champion‑Mastery‑V4
   (`nextMatchStartIndex` = paging cursor into match history). We can rebuild it ourselves with the Riot API.
2. **No matchup, counter or synergy data** is sent. That layer is ours to build.
3. **Worth copying:** the scenario model (slot alternatives = decision tree), categories as tags, and the team-wide "Pick Prio" column.
4. **Import our own data once:** a small script run in our logged-in tab can read `planner-pools-updated` and
   `planner-series-state` and save them as JSON to seed our database, with no extra load on their servers.
5. **Live lobby:** to relay picks from `socket.drafter.lol/guest`, capture one real lobby. The bundle has slot keys
   like `draft.pick.blue.1` and `draft.ban.red.4`.
