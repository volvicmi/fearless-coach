/** Starts importing a player's ranked games from the Riot API (runs in the background). */
export default defineEventHandler((event) => {
  if (!process.env.RIOT_API_KEY) {
    throw createError({ statusCode: 503, statusMessage: 'RIOT_API_KEY is missing: add it to .env and restart the server' })
  }
  return startSync(Number(getRouterParam(event, 'id')))
})
