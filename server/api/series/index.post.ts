import { MAX_GAMES } from '#shared/draft'
import { publishChange } from '../../utils/live'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const mode = body?.mode === 'duel' ? 'duel' : 'team'
  const { format, fearless, ourSide } = body ?? {}
  let name = String(body?.name ?? '').trim()
  let opponent = String(body?.opponent ?? '').trim()
  let playerA = ''
  let playerB = ''

  if (mode === 'duel') {
    playerA = String(body?.playerA ?? '').trim() || 'Joueur 1'
    playerB = String(body?.playerB ?? '').trim() || 'Joueur 2'
    if (playerA.length > 30 || playerB.length > 30) throw createError({ statusCode: 400, statusMessage: 'Les noms sont limités à 30 caractères' })
    if (playerA.toLowerCase() === playerB.toLowerCase()) throw createError({ statusCode: 400, statusMessage: 'Les deux joueurs doivent avoir un nom différent' })
    name ||= `${playerA} vs ${playerB}`
    opponent = ''
  }
  else if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Le nom est obligatoire' })
  }

  if (!(format in MAX_GAMES)) throw createError({ statusCode: 400, statusMessage: 'Format invalide' })
  if (!['hard', 'off'].includes(fearless)) throw createError({ statusCode: 400, statusMessage: 'Mode Fearless invalide' })
  if (!['blue', 'red'].includes(ourSide)) throw createError({ statusCode: 400, statusMessage: 'Côté invalide' })

  const db = useDb()
  const { lastInsertRowid } = db
    .prepare('INSERT INTO series (name, opponent, format, fearless, mode, player_a, player_b) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name, opponent, format, fearless, mode, playerA, playerB)
  db.prepare('INSERT INTO games (series_id, n, our_side) VALUES (?, 1, ?)').run(lastInsertRowid, ourSide)
  publishChange('series')

  return { id: Number(lastInsertRowid) }
})
