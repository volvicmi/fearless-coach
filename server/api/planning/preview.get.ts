import { loadPlanning, reminderWeek, weekMessage } from '../../utils/planning'

/** The Discord message as it would be sent now, without sending it. */
export default defineEventHandler(() => ({ message: weekMessage(loadPlanning(reminderWeek())) }))
