/** Imported tournaments and the champion stats summed over them. */
export default defineEventHandler(() => ({ tournaments: listTournaments(), meta: loadProMeta() }))
