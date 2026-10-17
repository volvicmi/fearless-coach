import { isIsoDate, mondayOf, fromIsoDate } from '#shared/planning'
import { loadPlanning } from '../../utils/planning'

/** Availability for one week: `?week=YYYY-MM-DD` (any day of it; this week by default). */
export default defineEventHandler((event) => {
  const { week } = getQuery(event)
  return loadPlanning(mondayOf(isIsoDate(week) ? fromIsoDate(week) : new Date()))
})
