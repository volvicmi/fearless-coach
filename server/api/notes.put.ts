const MAX_LENGTH = 20_000

export default defineEventHandler(async (event) => {
  const { text } = await readBody(event) ?? {}
  if (typeof text !== 'string') throw createError({ statusCode: 400, statusMessage: 'Le texte est obligatoire' })
  if (text.length > MAX_LENGTH) throw createError({ statusCode: 400, statusMessage: `Les notes sont limitées à ${MAX_LENGTH} caractères` })
  setSetting('notes', text)
  return { ok: true }
})
