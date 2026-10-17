/** Progress of the Riot sync started by POST. */
export default defineEventHandler(event => syncStatus(Number(getRouterParam(event, 'id'))))
