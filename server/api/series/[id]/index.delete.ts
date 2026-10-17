export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  useDb().prepare('DELETE FROM series WHERE id = ?').run(id)
  return { ok: true }
})
