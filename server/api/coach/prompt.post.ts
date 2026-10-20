const ANSWER_FORMAT = {
  advice: 'Answer in French: up to 3 options (champion, player, confidence, short reason), then one line on the enemy draft and one line on our plan.',
  prediction: 'Answer in French: the 3 most likely enemy choices (champion, confidence, short reason), then how we should answer.',
  review: 'Answer in French, for each team: estimated win rate (blue + red = 100), archetype, win conditions, power spikes, game plan, how to counter it. End with a verdict.',
}

/** The full coach prompt as plain text, to paste into any free AI chat: `{ gameId }`. */
export default defineEventHandler(async (event) => {
  const { gameId, draftOnly } = await readBody(event) ?? {}
  const prompt = buildCoachPrompt(await loadCoachContext(Number(gameId), draftOnly === true))
  return { text: [prompt.system, prompt.team, prompt.request, ANSWER_FORMAT[prompt.mode]].join('\n\n') }
})
