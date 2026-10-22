import { toScenario, validateColor, validateSlots, validatePrepCombos, validatePrepRoles, validatePickNotes, validateStyles } from '../../utils/prep'

/** Valider le patch entier avant une seule écriture évite les sauvegardes partielles. */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event) ?? {}
  const db = useDb()
  if (!db.prepare('SELECT 1 FROM prep_scenarios WHERE id = ?').get(id)) throw createError({ statusCode: 404, statusMessage: 'Draft de prep introuvable' })
  const columns: string[] = []
  const values: string[] = []
  const set = (column: string, value: string) => { columns.push(`${column} = ?`); values.push(value) }

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 100)
    if (!name) throw createError({ statusCode: 400, statusMessage: 'Le nom est obligatoire' })
    set('name', name)
  }
  if (body.color !== undefined) set('color', validateColor(body.color))
  if (body.styles !== undefined) { const styles = validateStyles(body.styles); set('styles', JSON.stringify(styles)); set('color', styles[0] ?? 'engage') }
  if (body.ourSide !== undefined) {
    if (!['blue', 'red'].includes(body.ourSide)) throw createError({ statusCode: 400, statusMessage: 'Côté invalide' })
    set('our_side', body.ourSide)
  }
  if (body.slots !== undefined) set('slots', JSON.stringify(await validateSlots(body.slots)))
  if (body.notes !== undefined) set('notes', String(body.notes).slice(0, 5000))
  if (body.pickRoles !== undefined) set('pick_roles', JSON.stringify(validatePrepRoles(body.pickRoles)))
  if (body.pickNotes !== undefined) set('pick_notes', JSON.stringify(validatePickNotes(body.pickNotes)))
  if (body.combos !== undefined) set('combos', JSON.stringify(await validatePrepCombos(body.combos)))
  if (columns.length) db.prepare(`UPDATE prep_scenarios SET ${columns.join(', ')} WHERE id = ?`).run(...values, id)

  const row = db.prepare('SELECT * FROM prep_scenarios WHERE id = ?').get(id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Draft de prep introuvable' })
  return toScenario(row)
})
