import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  // Override with NUXT_COACH_PROVIDER, NUXT_GEMINI_MODELS, NUXT_CLAUDE_MODEL, NUXT_CLAUDE_EFFORT in .env
  runtimeConfig: {
    coachProvider: 'auto', // auto | gemini | claude
    // Free Google AI Studio models, tried in order: each has its own daily quota.
    geminiModels: 'gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash,gemini-2.5-flash-lite',
    claudeModel: 'claude-opus-5-5',
    claudeEffort: 'low', // low = fastest answers during a live draft
    // Riot API (RIOT_API_KEY in .env). EUW by default: platform euw1, regional routing europe.
    riotPlatform: 'euw1',
    riotRegion: 'europe',
    riotMatchCount: 60, // ranked games fetched per player on first sync
  },
  app: {
    head: { title: 'Fearless Coach' },
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
