/** The coach notes (markdown) given to the AI with every request. */
export default defineEventHandler(() => ({ text: getSetting('notes') }))
