/** Imported tournaments, the one we are playing now, and the champion stats summed over all of them. */
export default defineEventHandler(() => ({
  tournaments: listTournaments(),
  current: getSetting('currentTournament'),
  meta: loadProMeta(),
}))
