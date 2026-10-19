import { publishChange } from '../../../utils/live'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  useDb().prepare('DELETE FROM players WHERE id = ?').run(id)
  publishChange('team')
  return { ok: true }
})
