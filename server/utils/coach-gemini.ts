import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai'
import { z } from 'zod'

let client: GoogleGenAI | undefined

/** Each free model has its own daily quota: a model that answered 429 is skipped for a while. */
const SKIP_MS = 10 * 60 * 1000
const exhaustedUntil = new Map<string, number>()
/** Un modèle surchargé ou trop lent passe en fin de file quelques minutes : les clics suivants ne perdent plus de temps sur lui. */
const SLOW_MS = 3 * 60 * 1000
const slowUntil = new Map<string, number>()

function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>
  return rest
}

function modelChain(): string[] {
  const { geminiModels } = useRuntimeConfig()
  return String(geminiModels).split(',').map(m => m.trim()).filter(Boolean)
}

/** A model that doesn't answer in time is skipped: the next one of the chain takes over. */
const TIMEOUT_MS = 15_000
/** Une analyse de fin de draft écrit beaucoup plus de texte qu'un conseil : elle a droit à plus de temps. */
const REVIEW_TIMEOUT_MS = 30_000
/** Au-delà de ce temps total, on arrête d'essayer des modèles : mieux vaut une erreur claire (ou le relais OpenRouter) qu'une longue attente. */
const BUDGET_MS = 25_000
const REVIEW_BUDGET_MS = 70_000

async function callModel(model: string, prompt: CoachPrompt, schema: z.ZodType): Promise<string | undefined> {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const response = await client.models.generateContent({
    model,
    contents: prompt.request,
    config: {
      systemInstruction: `${prompt.system}\n\n${prompt.team}`,
      responseMimeType: 'application/json',
      responseJsonSchema: jsonSchemaOf(schema),
      abortSignal: AbortSignal.timeout(prompt.mode === 'review' ? REVIEW_TIMEOUT_MS : TIMEOUT_MS),
      // Gemini 3 models: keep thinking short so advice arrives in a few seconds.
      ...(model.startsWith('gemini-3') && { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }),
    },
  })
  return response.text
}

/** Tries each model of NUXT_GEMINI_MODELS in order, moving on when one is out of quota or unknown. */
export async function askGemini<S extends z.ZodType>(prompt: CoachPrompt, schema: S): Promise<{ raw: z.infer<S>, model: string }> {
  const now = Date.now()
  const chain = modelChain()
  const usable = chain.filter(m => (exhaustedUntil.get(m) ?? 0) < now)
  const candidates = [...usable.filter(m => (slowUntil.get(m) ?? 0) < now), ...usable.filter(m => (slowUntil.get(m) ?? 0) >= now)]
  if (!candidates.length) {
    throw createError({ statusCode: 429, statusMessage: 'Quota Gemini gratuit épuisé sur tous les modèles : réessaie plus tard ou utilise « Copier le contexte »' })
  }

  let overloaded = false
  const started = Date.now()
  for (const model of candidates) {
    if (Date.now() - started > (prompt.mode === 'review' ? REVIEW_BUDGET_MS : BUDGET_MS)) { overloaded = true; break }
    let text: string | undefined
    try {
      text = await callModel(model, prompt, schema)
    }
    catch (err) {
      console.warn(`[gemini] ${model} : ${err instanceof ApiError ? err.status : (err as Error).name} ${(err as Error).message.slice(0, 120)}`)
      if (err instanceof ApiError && (err.status === 429 || err.status === 404)) {
        exhaustedUntil.set(model, Date.now() + SKIP_MS)
        continue
      }
      // Surcharge passagère (500 / 503 / 504) ou modèle trop lent : on essaie le modèle suivant, sans le mettre de côté.
      const slow = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      if (slow || (err instanceof ApiError && [500, 503, 504].includes(err.status))) {
        overloaded = true
        slowUntil.set(model, Date.now() + SLOW_MS)
        continue
      }
      if (err instanceof ApiError) {
        if (err.status === 400 || err.status === 401 || err.status === 403) {
          throw createError({ statusCode: 503, statusMessage: `Gemini a refusé la demande (${err.status}) : vérifie GEMINI_API_KEY` })
        }
        throw createError({ statusCode: 502, statusMessage: `Erreur de l’API Gemini ${err.status} : ${err.message}` })
      }
      throw err
    }

    const parsed = schema.safeParse(safeJson(text))
    if (!parsed.success) throw createError({ statusCode: 502, statusMessage: `${model} a renvoyé une réponse illisible, réessaie` })
    return { raw: parsed.data, model }
  }

  if (overloaded) {
    throw createError({ statusCode: 503, statusMessage: 'Gemini est surchargé en ce moment sur tous les modèles : réessaie dans une minute' })
  }
  throw createError({ statusCode: 429, statusMessage: 'Quota Gemini gratuit épuisé sur tous les modèles : réessaie plus tard ou utilise « Copier le contexte »' })
}

function safeJson(text: string | undefined): unknown {
  try { return JSON.parse(text ?? '') }
  catch { return null }
}
