import { z } from 'zod'
import { DRAFT_ORDER, NO_BAN, fearlessLocked, otherSide, picksOf, slotsOf } from '#shared/draft'
import type { Side } from '#shared/draft'
import { estimateWinRate } from '#shared/winrate'
import type { CoachContext } from '#shared/coach'
import type { DuelSideVerdict, DuelVerdict } from '#shared/types'
import { askAi } from './coach-ai'
import { contextBlock, proDraftsBlock, proMetaBlock } from './coach-prompt'
import type { CoachPrompt } from './coach-prompt'
import { toGame, useDb } from './db'
import { getChampions } from './ddragon'
import { loadProDrafts, loadProMeta } from './pro'

const SideSchema = z.object({
  winRate: z.number().describe('Win chance from the draft alone, 0-100'),
  archetype: z.string().describe('Identity of the composition, e.g. "Engage teamfight", "Poke siege", "Front to back"'),
  strengths: z.array(z.string()).describe('2 to 3 strengths of this draft'),
  missing: z.array(z.string()).describe('1 to 3 things the composition lacks (engage, frontline, magic damage, peel, waveclear…)'),
  better: z.string().describe('How this draft could have been better: at least one concrete pick or ban that was available, even for the winner'),
})

/** Réponse attendue de l'IA pour une draft de duel, validée avant d'atteindre l'écran. */
export const DuelSchema = z.object({
  blue: SideSchema,
  red: SideSchema,
  winner: z.enum(['blue', 'red']).describe('The side that drafted better: the one with the higher winRate'),
  verdict: z.string().describe('Who drafted better and why: the decisive factor, in 2 to 4 sentences'),
})
export type RawDuel = z.infer<typeof DuelSchema>

const DUEL_SYSTEM_PROMPT = `You are the neutral referee of a League of Legends draft duel. Two players draft against each other with the tournament draft order (bans, picks, blue and red side), possibly in a Fearless series. No game is played: from the draft alone, you decide who drafted better and who would be favoured.

You get the final draft of the game (bans and picks in order), the previous games of the series with the Fearless locks, a DATA ESTIMATE of the win chance (computed from pro results and damage mix), the pro meta and real pro drafts.

Judge the DRAFT, not the players' skill. Weigh together:
- composition: a clear identity (engage, poke, front to back, wombo combo, split push, protect the carry…), win conditions, frontline, engage and follow-up, peel / disengage, waveclear and objective control, damage mix, scaling and power spikes;
- lanes and counters: matchups, counter picks, synergies (bot lane duo, jungle-mid), flex picks that hid information;
- pick order and side: first-pick advantage, what each side could still answer, last-pick counters;
- bans: used well (threatening picks, a comfort pick denied) or wasted;
- Fearless: what each player burned or kept for the next games.

Output:
- winRate: start from the DATA ESTIMATE and move it by at most 10 points for what the data can't see (synergies, matchups, scaling). Blue + red = 100. Never exactly 50-50: pick a winner. winner = the side with the higher winRate.
- For each side: archetype; 2-3 strengths; 1-3 things missing from the composition; better = a short paragraph on how that draft could have been better. It must name at least one concrete champion or ban that was available at that step, for the winning side too (what would have made an already good draft stronger): never answer that nothing could be improved. Only suggest champions that were really available at that step: never one locked by Fearless (see LOCKED BY FEARLESS), already banned, or already picked earlier in the draft.
- verdict: 2-4 sentences: who drafted better, the decisive factor and how big the gap is. Say how far you moved from the data estimate and why.
- Use only the numbers given: never invent statistics.

Always call the players exactly "Joueur 1" and "Joueur 2" in your text (never "blue player" or a made-up name).
Write every text field in correct French with all accents (é, è, à, ç…), concise and concrete, like a coach commenting a draft.`

/**
 * Prompt du juge. Les noms saisis par les joueurs n'y figurent jamais (ce sont « Joueur 1 » et « Joueur 2 ») :
 * ils sont remis dans le texte après coup, pour qu'un nom ne puisse pas influencer le verdict.
 */
export function buildDuelPrompt(ctx: CoachContext): CoachPrompt {
  const byId = new Map(ctx.champions.map(c => [c.id, c]))
  const nameOf = (id: string) => byId.get(id)?.name ?? id
  const sideOfP1 = ctx.game.ourSide
  const label = (side: Side) => (side === sideOfP1 ? 'Joueur 1' : 'Joueur 2')
  const list = (actions: string[], side: Side, type: 'ban' | 'pick') =>
    slotsOf(actions, side, type).filter((c): c is string => !!c && c !== NO_BAN).map(nameOf).join(', ') || '-'

  const previous = ctx.games
    .filter(g => g.n < ctx.game.n)
    .map((g) => {
      const p1 = g.ourSide
      const result = g.winner ? `, verdict: ${g.winner === p1 ? 'Joueur 1' : 'Joueur 2'} drafted better` : ''
      return `Game ${g.n} (Joueur 1 was ${p1}${result}): Joueur 1 picks ${list(g.actions, p1, 'pick')}; Joueur 2 picks ${list(g.actions, otherSide(p1), 'pick')}`
    })

  const draft = DRAFT_ORDER.map((s, i) => {
    const champ = ctx.game.actions[i]!
    return `${i + 1}. ${label(s.side)} (${s.side}) ${s.type} ${s.slot + 1}: ${champ === NO_BAN ? 'no ban' : nameOf(champ)}`
  })

  const locked = [...fearlessLocked(ctx.fearless, ctx.games, ctx.game).keys()].map(nameOf)
  const estimate = estimateWinRate(ctx)
  const factors = estimate.factors.map(f => `- ${f.label} (${f.impact >= 0 ? '+' : ''}${f.impact} pts for blue): ${f.detail}`).join('\n') || '- no data factor'
  const sideBlock = (side: Side) =>
    `${label(side).toUpperCase()} (${side}): picks in order ${list(ctx.game.actions, side, 'pick')}; bans ${list(ctx.game.actions, side, 'ban')}`

  const request = [
    `DUEL: ${ctx.format}, ${ctx.fearless === 'off' ? 'normal draft (no Fearless)' : 'Fearless draft'}, game ${ctx.game.n}. Joueur 1 plays ${sideOfP1}, Joueur 2 plays ${otherSide(sideOfP1)}.`,
    previous.length ? `PREVIOUS GAMES:\n${previous.join('\n')}` : 'PREVIOUS GAMES: none',
    ctx.fearless === 'off' ? '' : `LOCKED BY FEARLESS (both players): ${locked.join(', ') || 'none'}`,
    `FINAL DRAFT, in order:\n${draft.join('\n')}`,
    sideBlock('blue'),
    sideBlock('red'),
    `DATA ESTIMATE: blue ${estimate.blue}% / red ${100 - estimate.blue}%\n${factors}`,
    proDraftsBlock(loadProDrafts(ctx.game.actions.filter(a => a !== NO_BAN), 10), nameOf),
    'TASK: JUDGE. Who drafted better, and by how much?',
  ].filter(Boolean).join('\n\n')

  return {
    mode: 'review',
    system: [DUEL_SYSTEM_PROMPT, contextBlock()].filter(Boolean).join('\n\n'),
    team: proMetaBlock(ctx.pro, nameOf),
    request,
  }
}

/** Remet les vrais noms des joueurs à la place de « Joueur 1 » / « Joueur 2 », en un seul passage. */
function withNames(text: string, names: { a: string, b: string }): string {
  return text.replace(/Joueur ([12])/g, (_, n: string) => (n === '1' ? names.a : names.b))
}

/**
 * Le gagnant vient du % final, jamais d'un champ séparé qui pourrait le contredire.
 * Les % sont normalisés (bleu + rouge = 100) et gardés à ±10 points de l'estimation chiffrée.
 */
function finalizeDuel(ctx: CoachContext, raw: RawDuel, names: { a: string, b: string }, model: string, started: number): DuelVerdict {
  const data = estimateWinRate(ctx)
  const b = Math.max(0, raw.blue.winRate)
  const r = Math.max(0, raw.red.winRate)
  const aiBlue = b + r > 0 ? Math.round((b / (b + r)) * 100) : data.blue
  const blue = Math.min(data.blue + 10, Math.max(data.blue - 10, aiBlue))
  // Égalité parfaite : on s'en remet au choix de l'IA.
  const winner: Side = blue > 50 ? 'blue' : blue < 50 ? 'red' : raw.winner

  const side = (s: RawDuel['blue'], winRate: number): DuelSideVerdict => ({
    winRate,
    archetype: withNames(s.archetype, names),
    strengths: s.strengths.map(t => withNames(t, names)),
    missing: s.missing.map(t => withNames(t, names)),
    better: withNames(s.better, names),
  })
  return {
    winner,
    blue: side(raw.blue, blue),
    red: side(raw.red, 100 - blue),
    verdict: withNames(raw.verdict, names),
    data,
    model,
    ms: Date.now() - started,
  }
}

/** Deux demandes simultanées pour la même game (automatique + bouton) n'en font qu'une. */
const inflight = new Map<number, Promise<DuelVerdict>>()

/** Juge la draft d'une game de duel, enregistre le verdict et le gagnant. `force` refait un verdict déjà donné. */
export function judgeGame(gameId: number, force = false): Promise<DuelVerdict> {
  const running = inflight.get(gameId)
  if (running) return running
  const job = run(gameId, force).finally(() => inflight.delete(gameId))
  inflight.set(gameId, job)
  return job
}

async function run(gameId: number, force: boolean): Promise<DuelVerdict> {
  const db = useDb()
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as any
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Game introuvable' })
  const game = toGame(row)
  const series = db.prepare('SELECT * FROM series WHERE id = ?').get(game.seriesId) as any
  if (series.mode !== 'duel') throw createError({ statusCode: 400, statusMessage: 'Le verdict est réservé au mode duel' })
  if (game.actions.length < DRAFT_ORDER.length) throw createError({ statusCode: 400, statusMessage: 'La draft n’est pas terminée' })
  if (game.verdict && !force) return game.verdict

  const games = (db.prepare('SELECT * FROM games WHERE series_id = ? ORDER BY n').all(game.seriesId) as any[]).map(toGame)
  const { champions } = await getChampions()
  // Pas d'équipe ni de combos en duel : le juge ne s'appuie que sur la draft et la méta pro.
  const ctx: CoachContext = { game, games, fearless: series.fearless, format: series.format, team: [], champions, pro: loadProMeta(), combos: [], opponent: '' }

  const started = Date.now()
  const { raw, model } = await askAi(buildDuelPrompt(ctx), DuelSchema)
  const verdict = finalizeDuel(ctx, raw, { a: series.player_a, b: series.player_b }, model, started)

  // La draft a pu être annulée pendant l'analyse : le verdict ne correspondrait plus à rien.
  const now = db.prepare('SELECT actions FROM games WHERE id = ?').get(gameId) as { actions: string } | undefined
  if (!now || now.actions !== row.actions) {
    throw createError({ statusCode: 409, statusMessage: 'La draft a changé pendant l’analyse : relance le verdict' })
  }
  db.prepare('UPDATE games SET verdict = ?, winner = ? WHERE id = ?').run(JSON.stringify(verdict), verdict.winner, gameId)
  return verdict
}
