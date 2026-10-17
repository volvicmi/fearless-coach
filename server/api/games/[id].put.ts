import { DRAFT_ORDER, NO_BAN } from '#shared/draft'

/** Partial update of a game: `actions`, `winner` (or null) and/or `ourSide`. */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event) ?? {}
  const db = useDb()

  if (body.actions !== undefined) {
    const ok = Array.isArray(body.actions)
      && body.actions.length <= DRAFT_ORDER.length
      && body.actions.every((a: unknown) => typeof a === 'string' && a.length > 0)
    if (!ok) throw createError({ statusCode: 400, statusMessage: 'invalid actions' })
    const champs = body.actions.filter((a: string) => a !== NO_BAN)
    if (new Set(champs).size !== champs.length) throw createError({ statusCode: 400, statusMessage: 'a champion appears twice in the draft' })
    db.prepare('UPDATE games SET actions = ? WHERE id = ?').run(JSON.stringify(body.actions), id)
  }
  if (body.winner !== undefined) {
    if (![null, 'blue', 'red'].includes(body.winner)) throw createError({ statusCode: 400, statusMessage: 'invalid winner' })
    db.prepare('UPDATE games SET winner = ? WHERE id = ?').run(body.winner, id)
  }
  if (body.ourSide !== undefined) {
    if (!['blue', 'red'].includes(body.ourSide)) throw createError({ statusCode: 400, statusMessage: 'invalid side' })
    db.prepare('UPDATE games SET our_side = ? WHERE id = ?').run(body.ourSide, id)
  }

  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'game not found' })
  return toGame(row)
})
