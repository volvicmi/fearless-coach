import { toPrep } from '../../utils/prep'

export default defineEventHandler(() => {
  const rows = useDb().prepare(`
    SELECT p.*, COUNT(s.id) AS scenario_count
    FROM preps p LEFT JOIN prep_scenarios s ON s.prep_id = p.id
    GROUP BY p.id ORDER BY p.id DESC
  `).all()
  return rows.map(toPrep)
})
