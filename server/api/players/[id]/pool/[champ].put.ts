import { TIERS } from '#shared/types'

/** Adds a champion to a player's pool, or updates its tier / note. */
export default defineEventHandler(async (event) => {
  const playerId = Number(getRouterParam(event, 'id'))
  const champId = getRouterParam(event, 'champ')!
  const body = await readBody(event) ?? {}
  if (!TIERS.includes(body.tier)) throw createError({ statusCode: 400, statusMessage: 'invalid tier' })

  const { champions } = await getChampions()
  if (!champions.some(c => c.id === champId)) throw createError({ statusCode: 400, statusMessage: 'unknown champion' })

  useDb().prepare(`
    INSERT INTO pool_entries (player_id, champ_id, tier, note) VALUES (?, ?, ?, ?)
    ON CONFLICT (player_id, champ_id) DO UPDATE SET tier = excluded.tier, note = excluded.note
  `).run(playerId, champId, body.tier, String(body.note ?? ''))
  return { ok: true }
})
