import { seatOf } from '../../../utils/duel-seats'

/** The two seats of a duel: name and whether it's taken, plus the seat of the caller (null = spectator). */
export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const row = useDb()
    .prepare('SELECT player_a, player_b, seat_a_token, seat_b_token FROM series WHERE id = ?')
    .get(id) as { player_a: string, player_b: string, seat_a_token: string, seat_b_token: string } | undefined
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Duel introuvable' })
  return {
    mySeat: seatOf(event, id),
    a: { name: row.player_a, taken: !!row.seat_a_token },
    b: { name: row.player_b, taken: !!row.seat_b_token },
  }
})
