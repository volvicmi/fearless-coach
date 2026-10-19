/** Every Champions list entry, best first inside each tier: `{ criterion, champId, tier, position }`. */
export default defineEventHandler(() => {
  const rows = useDb()
    .prepare('SELECT criterion, champ_id, tier, position FROM trait_entries ORDER BY criterion, position, champ_id')
    .all() as { criterion: string, champ_id: string, tier: string, position: number }[]
  return rows.map(r => ({ criterion: r.criterion, champId: r.champ_id, tier: r.tier, position: r.position }))
})
