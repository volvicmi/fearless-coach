/** Removes a tournament and everything imported from it. */
export default defineEventHandler((event) => {
  const name = decodeURIComponent(getRouterParam(event, 'name') ?? '')
  const db = useDb()
  for (const table of ['pro_games', 'pro_series', 'pro_champ_stats']) db.prepare(`DELETE FROM ${table} WHERE tournament = ?`).run(name)
  db.prepare('DELETE FROM pro_tournaments WHERE name = ?').run(name)
  return { ok: true }
})
