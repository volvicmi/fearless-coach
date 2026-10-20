import type { z } from 'zod'
import type { CoachContext } from '#shared/coach'
import type { CoachResult } from '#shared/types'

/** `auto` in the panel means "let the server choose" (see pickProvider). */
export type Provider = 'gemini' | 'claude' | 'openrouter'

/** Body values from the panel: anything else is ignored (automatic choice). */
export function parseProvider(value: unknown): Provider | undefined {
  return value === 'gemini' || value === 'claude' || value === 'openrouter' ? value : undefined
}

/** NUXT_COACH_PROVIDER wins; otherwise the first provider that has a key (Gemini first: it's free). */
function pickProvider(): Provider {
  const { coachProvider } = useRuntimeConfig()
  if (coachProvider === 'gemini' || coachProvider === 'claude') return coachProvider
  if (process.env.GEMINI_API_KEY) return 'gemini'
  if (process.env.ANTHROPIC_API_KEY) return 'claude'
  throw createError({
    statusCode: 503,
    statusMessage: 'Aucune clé IA : ajoute GEMINI_API_KEY (gratuite) ou ANTHROPIC_API_KEY dans .env et redémarre le serveur. « Copier le contexte » fonctionne sans clé.',
  })
}

/** Appelle le fournisseur d'IA choisi (Gemini ou Claude) et renvoie une réponse validée par le schéma. */
export async function askAi<S extends z.ZodType>(prompt: CoachPrompt, schema: S, provider?: Provider) {
  const chosen = provider ?? pickProvider()
  if (chosen === 'openrouter') return askOpenRouter(prompt, schema)
  if (chosen === 'claude') return askClaude(prompt, schema)
  try {
    return await askGemini(prompt, schema)
  }
  catch (err) {
    // Choix automatique : si Gemini est surchargé ou à court de quota, un modèle gratuit OpenRouter prend le relais (s'il est configuré).
    const status = (err as { statusCode?: number }).statusCode
    const fallback = !provider && !!process.env.OPENROUTER_API_KEY && !!useRuntimeConfig().openrouterModel
    if (fallback && (status === 429 || status === 502 || status === 503)) return askOpenRouter(prompt, schema)
    throw err
  }
}

/** Advice on our turn, prediction on theirs, full review once the draft is complete. */
export async function askCoach(ctx: CoachContext, provider?: Provider): Promise<CoachResult> {
  const prompt = buildCoachPrompt(ctx)
  const started = Date.now()
  if (prompt.mode === 'review') {
    const { raw, model } = await askAi(prompt, ReviewSchema, provider)
    return finalizeReview(ctx, raw, model, started)
  }
  const { raw, model } = await askAi(prompt, AdviceSchema, provider)
  return finalizeAdvice(ctx, raw, model, started)
}
