# Fearless Coach

Draft tool and (soon) AI co-coach for League of Legends **Fearless** series.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000. Needs Node 22.13+ (uses the built-in `node:sqlite`); data lives in `data/coach.db`.

For the AI coach, create a `.env` file at the project root with **one** key, and restart `npm run dev`:

- `GEMINI_API_KEY` (free, from https://aistudio.google.com/apikey). Free models are tried in order
  (`gemini-3.8-flash`, then 3.6 Flash, Flash-Lite models, 2.5…): when one hits its daily quota, the next one answers.
- `ANTHROPIC_API_KEY` (paid, better advice), default model `claude-opus-5-5`

With both keys, Gemini is used unless `NUXT_COACH_PROVIDER=claude`. Optional overrides: `NUXT_GEMINI_MODELS`
(comma-separated order), `NUXT_CLAUDE_MODEL`, `NUXT_CLAUDE_EFFORT` (defaults in `nuxt.config.ts`). Without any key, **Copy context**
puts the full coach prompt in the clipboard to paste into any AI chat.

For ranked stats, add `RIOT_API_KEY` (from https://developer.riotgames.com, development keys expire every 24 h)
to `.env`, set each player's Riot ID (`Name#TAG`) in the Team tab and click **Sync**. EUW by default
(`NUXT_RIOT_PLATFORM=euw1`, `NUXT_RIOT_REGION=europe`); the last 60 ranked games are imported, then only new ones.

Pro data comes from gol.gg (Pro tab): champion stats and the real drafts of each tournament, imported at one
page per second and cached. Coach notes (Notes tab) are free markdown sent to the AI with every request.

Draft prep (Prep tab): preps per opponent, several drafts each, several options per step (first = main
choice), drag and drop like the tier lists. Win chance in reviews starts from a data estimate (pro win rates,
our players' comfort, damage mix) shown factor by factor; the AI may move it by 10 points at most.

Planning tab: each player's usual days (with a time, 21:00 by default) plus per-date exceptions, a week view
with the starting five's status per day, and an optional weekly Discord summary through a channel webhook
(checked every 15 minutes while the app runs).

## What works today

- **Series**: Bo1/Bo3/Bo5, Fearless (a champion picked in an earlier game is locked for both teams) or normal draft.
- **Draft board**: standard 20-step tournament order, skip ban, undo (`Ctrl+Z`), side choice per game, winner and score.
- **Fast input**: type a few letters, `Enter` takes the first available champion.
- **Fearless locks** are computed from earlier games' picks (bans never carry over) and shown greyed out with the game that burned them.
- Champions come from the latest Data Dragon patch (cached 6 h).
- **Team tab**: players per role and champion pools with tiers S/A/B/C (click an icon to change tier).
- **Suggestions** (instant, no AI): ranks our open roles' pool picks by tier, flex value, damage mix and
  Fearless economy (penalty for burning the last strong picks of a thin pool early in a series).
- **AI coach** (Gemini free or Claude): reads the draft, pools, Fearless locks and the suggestion shortlist, answers in French
  with up to 3 picks/bans + enemy read + plan. Manual button or auto on our turns. Click a recommendation to play it.

## Layout

```
shared/draft.ts        draft order + Fearless rules (used by client and server)
server/utils/          SQLite (node:sqlite) and Data Dragon
server/api/            champions, series, games, duel (verdict de l'IA)
app/pages/             accueil Draft (cartes de séries), series/[id] (équipe), duel/[id] (1v1)
app/components/        ChampionGrid, DraftBoard, DraftSide
```

## Roadmap

1. ✅ Scaffold, champion grid, draft board, Fearless series
2. ✅ Team pools (players, tiers)
3. ✅ Scoring engine v1 (pool-based picks)
4. ✅ Claude co-coach (re-rank + explain, picks and bans)
5. ✅ Riot API import (ranked stats per player → suggestions and AI coach); next: lane matchups
6. Scrim history stats from saved games
7. Opponent scouting (enemy pools → targeted bans)
8. Pro/meta data import
9. Optional drafter.lol lobby relay
