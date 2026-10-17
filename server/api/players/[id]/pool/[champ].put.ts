import { TIERS } from '#shared/types'

/**
 * Adds a champion to a player's pool, or moves it: `{ tier, index?, note? }`.
 * `index` is its place inside the tier (0 = leftmost = strongest); without it the champion goes last.
 */
export default defineEventHandler(async (event) => {
  const playerId = Number(getRouterParam(event, 'id'))
  const champId = getRouterParam(event, 'champ')!
  const body = await readBody(event) ?? {}
  if (!TIERS.includes(body.tier)) throw createError({ statusCode: 400, statusMessage: 'invalid tier' })
  if (body.index !== undefined && !(Number.isInteger(body.index) && body.index >= 0)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid index' })
  }

  const { champions } = await getChampions()
  if (!champions.some(c => c.id === champId)) throw createError({ statusCode: 400, statusMessage: 'unknown champion' })

  const db = useDb()
  db.exec('BEGIN')
  try {
    db.prepare(`
      INSERT INTO pool_entries (player_id, champ_id, tier, note) VALUES (?, ?, ?, ?)
      ON CONFLICT (player_id, champ_id) DO UPDATE SET tier = excluded.tier
    `).run(playerId, champId, body.tier, String(body.note ?? ''))
    if (body.note !== undefined) {
      db.prepare('UPDATE pool_entries SET note = ? WHERE player_id = ? AND champ_id = ?').run(String(body.note), playerId, champId)
    }

    // Renumber the tier with the champion at its new place.
    const others = (db.prepare(`
      SELECT champ_id FROM pool_entries WHERE player_id = ? AND tier = ? AND champ_id != ? ORDER BY position, champ_id
    `).all(playerId, body.tier, champId) as { champ_id: string }[]).map(r => r.champ_id)
    const ordered = [...others]
    ordered.splice(Math.min(body.index ?? others.length, others.length), 0, champId)
    const setPosition = db.prepare('UPDATE pool_entries SET position = ? WHERE player_id = ? AND champ_id = ?')
    ordered.forEach((id, i) => setPosition.run(i, playerId, id))
    db.exec('COMMIT')
  }
  catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return { ok: true }
})
