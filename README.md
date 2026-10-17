# Fearless Coach

Draft tool and (soon) AI co-coach for League of Legends **Fearless** series.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000. Needs Node 22.13+ (uses the built-in `node:sqlite`); data lives in `data/coach.db`.

## What works today

- **Series**: Bo1/Bo3/Bo5, Fearless rule `hard` (picks locked for both teams), `soft` (each team loses only its own picks) or `off`.
- **Draft board**: standard 20-step tournament order, skip ban, undo (`Ctrl+Z`), side choice per game, winner and score.
- **Fast input**: type a few letters, `Enter` takes the first available champion.
- **Fearless locks** are computed from earlier games' picks (bans never carry over) and shown greyed out with the game that burned them.
- Champions come from the latest Data Dragon patch (cached 6 h).

## Layout

```
shared/draft.ts        draft order + Fearless rules (used by client and server)
server/utils/          SQLite (node:sqlite) and Data Dragon
server/api/            champions, series, games
app/pages/             series list, series/draft page
app/components/        ChampionGrid, DraftBoard, DraftSide
```

## Roadmap

1. ✅ Scaffold, champion grid, draft board, Fearless series
2. Team pools (players, tiers, categories)
3. Scrim history stats from saved games
4. Riot API import (SoloQ pools, matchups)
5. Pro/meta data import
6. Scoring engine (top picks/bans per step)
7. Claude co-coach (re-rank + explain)
8. Optional drafter.lol lobby relay
