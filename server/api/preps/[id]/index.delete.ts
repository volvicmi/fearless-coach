export default defineEventHandler((event) => {
  useDb().prepare('DELETE FROM preps WHERE id = ?').run(Number(getRouterParam(event, 'id')))
  return { ok: true }
})
