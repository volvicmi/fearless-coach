import { CRITERIA, TIERS } from '#shared/champion-traits'
import { publishChange } from '../../../utils/live'

/**
 * Puts a champion in a tier of a criterion list, or moves it: `{ tier, index? }`.
 * `index` is its place inside the tier (0 = strongest); without it the champion goes last.
 */
export default defineEventHandler(async (event) => {
  const criterion = getRouterParam(event, 'criterion')!
  const champId = getRouterParam(event, 'champ')!
  const body = await readBody(event) ?? {}
  if (!CRITERIA.some(c => c.id === criterion)) throw createError({ statusCode: 400, statusMessage: 'Critère inconnu' })
  if (!TIERS.includes(body.tier)) throw createError({ statusCode: 400, statusMessage: 'Tier invalide' })
  if (body.index !== undefined && !(Number.isInteger(body.index) && body.index >= 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Position invalide' })
  }

  const { champions } = await getChampions()
  if (!champions.some(c => c.id === champId)) throw createError({ statusCode: 400, statusMessage: 'Champion inconnu' })

  const db = useDb()
  db.exec('BEGIN')
  try {
    db.prepare(`
      INSERT INTO trait_entries (criterion, champ_id, tier, position) VALUES (?, ?, ?, 0)
      ON CONFLICT (criterion, champ_id) DO UPDATE SET tier = excluded.tier
    `).run(criterion, champId, body.tier)

    // Renumber the tier with the champion at its new place.
    const others = (db.prepare(`
      SELECT champ_id FROM trait_entries WHERE criterion = ? AND tier = ? AND champ_id != ? ORDER BY position, champ_id
    `).all(criterion, body.tier, champId) as { champ_id: string }[]).map(r => r.champ_id)
    others.splice(Math.min(body.index ?? others.length, others.length), 0, champId)
    const setPosition = db.prepare('UPDATE trait_entries SET position = ? WHERE criterion = ? AND champ_id = ?')
    others.forEach((id, i) => setPosition.run(i, criterion, id))
    db.exec('COMMIT')
  }
  catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  publishChange('traits')
  return { ok: true }
})
