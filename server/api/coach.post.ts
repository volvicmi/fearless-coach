/** AI advice for the current step of a game: `{ gameId }`. */
export default defineEventHandler(async (event) => {
  const { gameId } = await readBody(event) ?? {}
  return askCoach(await loadCoachContext(Number(gameId)))
})
