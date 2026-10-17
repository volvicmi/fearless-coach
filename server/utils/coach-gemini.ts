import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai'
import { z } from 'zod'

let client: GoogleGenAI | undefined

/** Each free model has its own daily quota: a model that answered 429 is skipped for a while. */
const SKIP_MS = 10 * 60 * 1000
const exhaustedUntil = new Map<string, number>()

function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>
  return rest
}

function modelChain(): string[] {
  const { geminiModels } = useRuntimeConfig()
  return String(geminiModels).split(',').map(m => m.trim()).filter(Boolean)
}

async function callModel(model: string, prompt: CoachPrompt, schema: z.ZodType): Promise<string | undefined> {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const response = await client.models.generateContent({
    model,
    contents: prompt.request,
    config: {
      systemInstruction: `${prompt.system}\n\n${prompt.team}`,
      responseMimeType: 'application/json',
      responseJsonSchema: jsonSchemaOf(schema),
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
  const candidates = chain.filter(m => (exhaustedUntil.get(m) ?? 0) < now)
  if (!candidates.length) {
    throw createError({ statusCode: 429, statusMessage: 'Quota Gemini gratuit épuisé sur tous les modèles : réessaie plus tard ou utilise « Copier le contexte »' })
  }

  for (const model of candidates) {
    let text: string | undefined
    try {
      text = await callModel(model, prompt, schema)
    }
    catch (err) {
      if (err instanceof ApiError && (err.status === 429 || err.status === 404)) {
        exhaustedUntil.set(model, Date.now() + SKIP_MS)
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

  throw createError({ statusCode: 429, statusMessage: 'Quota Gemini gratuit épuisé sur tous les modèles : réessaie plus tard ou utilise « Copier le contexte »' })
}

function safeJson(text: string | undefined): unknown {
  try { return JSON.parse(text ?? '') }
  catch { return null }
}
