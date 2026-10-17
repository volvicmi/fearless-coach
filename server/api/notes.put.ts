const MAX_LENGTH = 20_000

export default defineEventHandler(async (event) => {
  const { text } = await readBody(event) ?? {}
  if (typeof text !== 'string') throw createError({ statusCode: 400, statusMessage: 'text is required' })
  if (text.length > MAX_LENGTH) throw createError({ statusCode: 400, statusMessage: `Notes are limited to ${MAX_LENGTH} characters` })
  setSetting('notes', text)
  return { ok: true }
})
