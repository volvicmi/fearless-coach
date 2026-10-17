export default defineEventHandler((event) => {
  useDb().prepare('DELETE FROM prep_scenarios WHERE id = ?').run(Number(getRouterParam(event, 'id')))
  return { ok: true }
})
