import type { z } from 'zod'
import type { CoachPrompt } from './coach-prompt'

/**
 * OpenRouter: one API key, many models behind an OpenAI-compatible endpoint.
 * Used to compare answers with Gemini and Claude. The model is chosen in NUXT_OPENROUTER_MODEL.
 */
export async function askOpenRouter<S extends z.ZodType>(prompt: CoachPrompt, schema: S): Promise<{ raw: z.infer<S>, model: string }> {
  const { openrouterModel } = useRuntimeConfig()
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw createError({ statusCode: 503, statusMessage: 'OPENROUTER_API_KEY manquante dans .env (ou dans les variables Coolify)' })
  if (!openrouterModel) {
    throw createError({ statusCode: 503, statusMessage: 'Choisis un modèle OpenRouter : NUXT_OPENROUTER_MODEL (un modèle « :free » sur openrouter.ai/models)' })
  }
  // Garde-fou : seuls les modèles gratuits (suffixe « :free ») peuvent être appelés, jamais un modèle payant.
  if (!openrouterModel.endsWith(':free')) {
    throw createError({ statusCode: 503, statusMessage: `Modèle refusé : « ${openrouterModel} » n’est pas gratuit (il doit finir par « :free »)` })
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(prompt.mode === 'review' ? 60_000 : 30_000),
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: openrouterModel,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${prompt.system}\n\n${prompt.team}` },
        { role: 'user', content: `${prompt.request}\n\nRéponds uniquement avec un objet JSON valide, sans texte autour.` },
      ],
    }),
  }).catch(() => {
    throw createError({ statusCode: 503, statusMessage: 'OpenRouter ne répond pas (délai dépassé) : réessaie dans un instant' })
  })
  if (res.status === 401) throw createError({ statusCode: 503, statusMessage: 'OPENROUTER_API_KEY invalide' })
  if (res.status === 402) throw createError({ statusCode: 402, statusMessage: 'OpenRouter : crédit insuffisant pour ce modèle' })
  if (res.status === 429) throw createError({ statusCode: 429, statusMessage: 'Limite OpenRouter atteinte, réessaie dans un instant' })
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `Erreur OpenRouter ${res.status}` })

  const body = await res.json().catch(() => {
    throw createError({ statusCode: 503, statusMessage: 'OpenRouter ne répond pas (délai dépassé) : réessaie dans un instant' })
  }) as { model?: string, choices?: { message?: { content?: string } }[] }
  const text = body.choices?.[0]?.message?.content ?? ''
  let raw: z.infer<S>
  try {
    // Many free models wrap the JSON in ```json fences or add a sentence around it: keep the object only.
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    raw = schema.parse(JSON.parse(text.slice(start, end + 1)))
  }
  catch {
    throw createError({ statusCode: 502, statusMessage: `${openrouterModel} a renvoyé une réponse illisible, réessaie ou change de modèle` })
  }
  return { raw, model: body.model ?? openrouterModel }
}
