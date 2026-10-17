import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z } from 'zod'

let client: Anthropic | undefined

export async function askClaude<S extends z.ZodType>(prompt: CoachPrompt, schema: S): Promise<{ raw: z.infer<S>, model: string }> {
  const { claudeModel, claudeEffort } = useRuntimeConfig()
  client ??= new Anthropic()

  let response
  try {
    response = await client.beta.messages.parse({
      model: claudeModel,
      max_tokens: 16000,
      output_config: {
        effort: claudeEffort as 'low' | 'medium' | 'high',
        format: betaZodOutputFormat(schema),
      },
      // Re-runs the request on a fallback model if a safety classifier declines it.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: prompt.system },
        // Team pools change rarely: cache everything up to here, the draft state comes after.
        { type: 'text', text: prompt.team, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: prompt.request }],
    })
  }
  catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw createError({ statusCode: 503, statusMessage: 'Invalid ANTHROPIC_API_KEY' })
    if (err instanceof Anthropic.RateLimitError) throw createError({ statusCode: 429, statusMessage: 'Claude rate limit reached, retry in a moment' })
    if (err instanceof Anthropic.APIError) throw createError({ statusCode: 502, statusMessage: `Claude API error ${err.status}: ${err.message}` })
    throw err
  }

  if (response.stop_reason === 'refusal') throw createError({ statusCode: 502, statusMessage: 'Claude declined this request' })
  if (response.parsed_output == null) throw createError({ statusCode: 502, statusMessage: 'Claude returned an unreadable answer' })
  return { raw: response.parsed_output, model: response.model }
}
