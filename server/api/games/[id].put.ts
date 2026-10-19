import { DRAFT_ORDER, NO_BAN } from '#shared/draft'
import type { Side } from '#shared/draft'
import { publishChange } from '../../utils/live'
import { seatOf, sideOfSeat } from '../../utils/duel-seats'

/** Partial update of a game: `actions`, `winner` (or null) and/or `ourSide`. */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event) ?? {}
  const db = useDb()

  // Duel: a seat plays only its own side, only seat A picks the sides, and spectators change nothing.
  const owner = db.prepare('SELECT g.series_id, g.our_side, g.actions, s.mode FROM games g JOIN series s ON s.id = g.series_id WHERE g.id = ?')
    .get(id) as { series_id: number, our_side: Side, actions: string, mode: string } | undefined
  if (owner?.mode === 'duel') {
    const seat = seatOf(event, owner.series_id)
    if (!seat) throw createError({ statusCode: 403, statusMessage: 'Spectateur : tu ne peux pas modifier ce duel' })
    if (body.ourSide !== undefined && seat !== 'a') throw createError({ statusCode: 403, statusMessage: 'Seul le joueur A choisit les côtés' })
    if (Array.isArray(body.actions)) {
      const mine = sideOfSeat(seat, (body.ourSide ?? owner.our_side) as Side)
      const before = JSON.parse(owner.actions) as string[]
      const len = Math.max(before.length, body.actions.length)
      for (let i = 0; i < len; i++) {
        if (body.actions[i] !== before[i] && DRAFT_ORDER[i]?.side !== mine) {
          throw createError({ statusCode: 403, statusMessage: 'Ce coup n’est pas dans ton côté' })
        }
      }
    }
  }

  if (body.actions !== undefined) {
    const ok = Array.isArray(body.actions)
      && body.actions.length <= DRAFT_ORDER.length
      && body.actions.every((a: unknown) => typeof a === 'string' && a.length > 0)
    if (!ok) throw createError({ statusCode: 400, statusMessage: 'Actions invalides' })
    const champs = body.actions.filter((a: string) => a !== NO_BAN)
    if (new Set(champs).size !== champs.length) throw createError({ statusCode: 400, statusMessage: 'Un champion apparaît deux fois dans la draft' })
    db.prepare('UPDATE games SET actions = ? WHERE id = ?').run(JSON.stringify(body.actions), id)
    // Duel : si la draft change, l'ancien verdict ne vaut plus rien (le gagnant en découle).
    const info = db.prepare('SELECT s.mode FROM games g JOIN series s ON s.id = g.series_id WHERE g.id = ?').get(id) as { mode: string } | undefined
    if (info?.mode === 'duel') db.prepare('UPDATE games SET verdict = NULL, winner = NULL WHERE id = ?').run(id)
  }
  if (body.winner !== undefined) {
    if (![null, 'blue', 'red'].includes(body.winner)) throw createError({ statusCode: 400, statusMessage: 'Gagnant invalide' })
    db.prepare('UPDATE games SET winner = ? WHERE id = ?').run(body.winner, id)
  }
  if (body.ourSide !== undefined) {
    if (!['blue', 'red'].includes(body.ourSide)) throw createError({ statusCode: 400, statusMessage: 'Côté invalide' })
    db.prepare('UPDATE games SET our_side = ? WHERE id = ?').run(body.ourSide, id)
  }

  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Game introuvable' })
  publishChange('series')
  return toGame(row)
})
