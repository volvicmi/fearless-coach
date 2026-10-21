import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css', '~/assets/css/prep.css'],
  // Override with NUXT_COACH_PROVIDER, NUXT_GEMINI_MODELS, NUXT_CLAUDE_MODEL, NUXT_CLAUDE_EFFORT in .env
  runtimeConfig: {
    coachProvider: 'auto', // auto | gemini | claude
    // Free Google AI Studio models, tried in order: each has its own daily quota.
    geminiModels: 'gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite',
    // OpenRouter (comparison provider): OPENROUTER_API_KEY in .env, model id here or NUXT_OPENROUTER_MODEL.
    openrouterModel: '',
    claudeModel: 'claude-opus-5-5',
    claudeEffort: 'low', // low = fastest answers during a live draft
    // Riot API (RIOT_API_KEY in .env). EUW by default: platform euw1, regional routing europe.
    riotPlatform: 'euw1',
    riotRegion: 'europe',
    riotMatchCount: 60, // ranked games fetched per player on first sync
  },
  app: {
    head: {
      title: 'Coach Opif',
      // Polices de la charte Régie (Google Fonts, gratuites)
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Saira+Condensed:ital,wght@0,500;0,600;0,700;0,800;1,800&display=swap',
        },
      ],
    },
  },
  nitro: {
    experimental: { tasks: true },
    // Checks every 15 minutes whether the weekly Discord reminder is due (server/tasks/planning/reminder.ts).
    scheduledTasks: { '*/15 * * * *': ['planning:reminder'] },
  },
  vite: {
    plugins: [tailwindcss() as any],
  },
})
