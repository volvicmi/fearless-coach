import { toPrep, toScenario } from '../../utils/prep'

/** All preps with a light copy of their drafts for previews. */
export default defineEventHandler(() => {
  const db = useDb()
  const preps = db.prepare('SELECT * FROM preps ORDER BY id DESC').all().map(toPrep)
  const scenarios = db.prepare('SELECT * FROM prep_scenarios ORDER BY position, id').all().map(toScenario)
  return preps.map((p) => {
    const own = scenarios.filter(s => s.prepId === p.id)
    return {
      ...p,
      scenarioCount: own.length,
      scenarios: own.map(({ id, name, color, styles, rank, ourSide, slots, pickRoles, notes }) => ({ id, name, color, styles, rank, ourSide, slots, pickRoles, notes: notes.slice(0, 140) })),
    }
  })
})
