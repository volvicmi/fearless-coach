import { startProSync } from '../../utils/pro'

/** Starts (or resumes) importing a tournament from gol.gg: `{ name }`. Runs in the background. */
export default defineEventHandler(async (event) => {
  const name = String((await readBody(event))?.name ?? '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })
  return startProSync(name)
})
