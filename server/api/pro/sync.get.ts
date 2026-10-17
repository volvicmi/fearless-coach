import { proSyncStatus } from '../../utils/pro'

/** Progress of a tournament import: `?name=`. */
export default defineEventHandler(event => proSyncStatus(String(getQuery(event).name ?? '')))
