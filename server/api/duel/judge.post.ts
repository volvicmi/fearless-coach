import { judgeGame } from '../../utils/duel-judge'
import { publishChange } from '../../utils/live'

/** Verdict de l'IA sur la draft terminée d'une game de duel : `{ gameId, force? }`. */
export default defineEventHandler(async (event) => {
  const { gameId, force } = await readBody(event) ?? {}
  const verdict = await judgeGame(Number(gameId), force === true)
  publishChange('series')
  return verdict
})
