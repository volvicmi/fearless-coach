import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { otherSide } from '#shared/draft'
import type { Side } from '#shared/draft'

export type Seat = 'a' | 'b'

/** The browser sends its seat token in this header; spectators send none. */
export const SEAT_HEADER = 'x-duel-token'

/** Which seat this request holds in a duel, or null for a spectator (or a wrong token). */
export function seatOf(event: H3Event, seriesId: number): Seat | null {
  const token = getHeader(event, SEAT_HEADER)
  if (!token) return null
  const row = useDb()
    .prepare('SELECT seat_a_token, seat_b_token FROM series WHERE id = ?')
    .get(seriesId) as { seat_a_token: string, seat_b_token: string } | undefined
  if (!row) return null
  if (row.seat_a_token && row.seat_a_token === token) return 'a'
  if (row.seat_b_token && row.seat_b_token === token) return 'b'
  return null
}

export const newSeatToken = () => randomUUID()

/** Side played by a seat in a game: seat A plays the game's `ourSide`, seat B the other one. */
export function sideOfSeat(seat: Seat, ourSide: Side): Side {
  return seat === 'a' ? ourSide : otherSide(ourSide)
}
