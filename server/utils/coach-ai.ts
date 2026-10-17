import type { z } from 'zod'
import type { CoachContext } from '#shared/coach'
import type { CoachResult } from '#shared/types'

type Provider = 'gemini' | 'claude'

/** NUXT_COACH_PROVIDER wins; otherwise the first provider that has a key (Gemini first: it's free). */
function pickProvider(): Provider {
  const { coachProvider } = useRuntimeConfig()
  if (coachProvider === 'gemini' || coachProvider === 'claude') return coachProvider
  if (process.env.GEMINI_API_KEY) return 'gemini'
  if (process.env.ANTHROPIC_API_KEY) return 'claude'
  throw createError({
    statusCode: 503,
    statusMessage: 'No AI key: add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY to .env and restart the server. "Copy context" works without a key.',
  })
}

function ask<S extends z.ZodType>(prompt: CoachPrompt, schema: S) {
  return pickProvider() === 'gemini' ? askGemini(prompt, schema) : askClaude(prompt, schema)
}

/** Advice on our turn, prediction on theirs, full review once the draft is complete. */
export async function askCoach(ctx: CoachContext): Promise<CoachResult> {
  const prompt = buildCoachPrompt(ctx)
  const started = Date.now()
  if (prompt.mode === 'review') {
    const { raw, model } = await ask(prompt, ReviewSchema)
    return finalizeReview(raw, model, started)
  }
  const { raw, model } = await ask(prompt, AdviceSchema)
  return finalizeAdvice(ctx, raw, model, started)
}
