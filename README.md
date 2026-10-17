# Fearless Coach

Draft tool and (soon) AI co-coach for League of Legends **Fearless** series.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000. Needs Node 22.13+ (uses the built-in `node:sqlite`); data lives in `data/coach.db`.

For the AI coach, copy `.env.example` to `.env`, set `ANTHROPIC_API_KEY`, and restart `npm run dev`.

## What works today

- **Series**: Bo1/Bo3/Bo5, Fearless rule `hard` (picks locked for both teams), `soft` (each team loses only its own picks) or `off`.
- **Draft board**: standard 20-step tournament order, skip ban, undo (`Ctrl+Z`), side choice per game, winner and score.
- **Fast input**: type a few letters, `Enter` takes the first available champion.
- **Fearless locks** are computed from earlier games' picks (bans never carry over) and shown greyed out with the game that burned them.
- Champions come from the latest Data Dragon patch (cached 6 h).
- **Team tab**: players per role and champion pools with tiers S/A/B/C (click an icon to change tier).
- **Suggestions** (instant, no AI): ranks our open roles' pool picks by tier, flex value, damage mix and
  Fearless economy (penalty for burning the last strong picks of a thin pool early in a series).
- **AI coach** (Claude): reads the draft, pools, Fearless locks and the suggestion shortlist, answers in French
  with up to 3 picks/bans + enemy read + plan. Manual button or auto on our turns. Click a recommendation to play it.

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
2. ✅ Team pools (players, tiers)
3. ✅ Scoring engine v1 (pool-based picks)
4. ✅ Claude co-coach (re-rank + explain, picks and bans)
5. Riot API import (SoloQ stats per player → pool tiers, matchups)
6. Scrim history stats from saved games
7. Opponent scouting (enemy pools → targeted bans)
8. Pro/meta data import
9. Optional drafter.lol lobby relay
