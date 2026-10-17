export default defineEventHandler((event) => {
  const playerId = Number(getRouterParam(event, 'id'))
  const champId = getRouterParam(event, 'champ')!
  useDb().prepare('DELETE FROM pool_entries WHERE player_id = ? AND champ_id = ?').run(playerId, champId)
  return { ok: true }
})
