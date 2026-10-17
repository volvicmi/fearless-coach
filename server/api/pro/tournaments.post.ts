import { startProSync } from '../../utils/pro'

/** Adds a gol.gg tournament by its exact name, e.g. "LCK Cup 2026". */
export default defineEventHandler(async (event) => {
  const name = String((await readBody(event))?.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })
  useDb().prepare('INSERT OR IGNORE INTO pro_tournaments (name) VALUES (?)').run(name)
  return startProSync(name)
})
