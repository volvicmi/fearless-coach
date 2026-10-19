import { newSeatToken, seatOf } from '../../../utils/duel-seats'
import type { Seat } from '../../../utils/duel-seats'
import { publishChange } from '../../../utils/live'

/** Takes a free seat of a duel: `{ seat: 'a' | 'b', name }`. Returns the token the browser keeps. */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event) ?? {}
  const seat = body.seat as Seat
  const name = String(body.name ?? '').trim()
  if (!['a', 'b'].includes(seat)) throw createError({ statusCode: 400, statusMessage: 'Siège invalide' })
  if (!name || name.length > 30) throw createError({ statusCode: 400, statusMessage: 'Le nom doit faire entre 1 et 30 caractères' })

  const db = useDb()
  const series = db.prepare('SELECT mode, seat_a_token, seat_b_token FROM series WHERE id = ?')
    .get(id) as { mode: string, seat_a_token: string, seat_b_token: string } | undefined
  if (!series || series.mode !== 'duel') throw createError({ statusCode: 404, statusMessage: 'Duel introuvable' })
  if (seatOf(event, id)) throw createError({ statusCode: 409, statusMessage: 'Tu as déjà un siège dans ce duel' })
  const taken = seat === 'a' ? series.seat_a_token : series.seat_b_token
  if (taken) throw createError({ statusCode: 409, statusMessage: 'Ce siège est déjà pris' })

  const token = newSeatToken()
  if (seat === 'a') db.prepare('UPDATE series SET seat_a_token = ?, player_a = ? WHERE id = ?').run(token, name, id)
  else db.prepare('UPDATE series SET seat_b_token = ?, player_b = ? WHERE id = ?').run(token, name, id)
  publishChange('series')
  return { token, seat }
})
