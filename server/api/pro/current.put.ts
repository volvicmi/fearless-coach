/** Marks the tournament we are playing in now (`{ name }`, empty to clear). Used later to focus the coach on it. */
export default defineEventHandler(async (event) => {
  setSetting('currentTournament', String((await readBody(event))?.name ?? '').trim())
  return { ok: true }
})
