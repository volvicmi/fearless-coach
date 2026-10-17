import { toScenario, validateColor, validateSlots } from '../../utils/prep'

/** Partial update of a scenario: name, color, ourSide, slots, notes. */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event) ?? {}
  const db = useDb()

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })
    db.prepare('UPDATE prep_scenarios SET name = ? WHERE id = ?').run(name, id)
  }
  if (body.color !== undefined) db.prepare('UPDATE prep_scenarios SET color = ? WHERE id = ?').run(validateColor(body.color), id)
  if (body.ourSide !== undefined) {
    if (!['blue', 'red'].includes(body.ourSide)) throw createError({ statusCode: 400, statusMessage: 'invalid side' })
    db.prepare('UPDATE prep_scenarios SET our_side = ? WHERE id = ?').run(body.ourSide, id)
  }
  if (body.slots !== undefined) db.prepare('UPDATE prep_scenarios SET slots = ? WHERE id = ?').run(JSON.stringify(await validateSlots(body.slots)), id)
  if (body.notes !== undefined) db.prepare('UPDATE prep_scenarios SET notes = ? WHERE id = ?').run(String(body.notes).slice(0, 5000), id)

  const row = db.prepare('SELECT * FROM prep_scenarios WHERE id = ?').get(id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'scenario not found' })
  return toScenario(row)
})
