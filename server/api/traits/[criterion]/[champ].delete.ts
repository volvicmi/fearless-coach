import { publishChange } from '../../../utils/live'

/** Removes a champion from a criterion list. */
export default defineEventHandler((event) => {
  const criterion = getRouterParam(event, 'criterion')!
  const champId = getRouterParam(event, 'champ')!
  useDb().prepare('DELETE FROM trait_entries WHERE criterion = ? AND champ_id = ?').run(criterion, champId)
  publishChange('traits')
  return { ok: true }
})
