import { DRAFT_ORDER, NO_BAN } from '#shared/draft'
import { publishChange } from '../../utils/live'

/** Partial update of a game: `actions`, `winner` (or null) and/or `ourSide`. */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event) ?? {}
  const db = useDb()

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
