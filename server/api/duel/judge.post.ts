import { judgeGame } from '../../utils/duel-judge'

/** Verdict de l'IA sur la draft terminée d'une game de duel : `{ gameId, force? }`. */
export default defineEventHandler(async (event) => {
  const { gameId, force } = await readBody(event) ?? {}
  return judgeGame(Number(gameId), force === true)
})
