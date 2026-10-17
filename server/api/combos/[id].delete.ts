export default defineEventHandler((event) => {
  useDb().prepare('DELETE FROM combos WHERE id = ?').run(Number(getRouterParam(event, 'id')))
  return { ok: true }
})
