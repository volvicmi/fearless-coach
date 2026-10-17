import type { PrepDetail } from '#shared/types'
import { toPrep, toScenario } from '../../../utils/prep'

export default defineEventHandler((event): PrepDetail => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const row = db.prepare('SELECT * FROM preps WHERE id = ?').get(id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'prep not found' })
  const scenarios = db.prepare('SELECT * FROM prep_scenarios WHERE prep_id = ? ORDER BY position, id').all(id)
  return { prep: toPrep(row), scenarios: scenarios.map(toScenario) }
})
