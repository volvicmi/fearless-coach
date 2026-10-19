import { seatOf } from '../../../utils/duel-seats'
import { publishChange } from '../../../utils/live'

/** Changes the name of the seat the caller holds, at any time (even mid-draft): `{ name }`. */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const seat = seatOf(event, id)
  if (!seat) throw createError({ statusCode: 403, statusMessage: 'Tu n’as pas de siège dans ce duel' })
  const name = String((await readBody(event) ?? {}).name ?? '').trim()
  if (!name || name.length > 30) throw createError({ statusCode: 400, statusMessage: 'Le nom doit faire entre 1 et 30 caractères' })

  useDb().prepare(`UPDATE series SET ${seat === 'a' ? 'player_a' : 'player_b'} = ? WHERE id = ?`).run(name, id)
  publishChange('series')
  return { ok: true }
})
