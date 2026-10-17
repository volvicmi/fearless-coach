import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  // Override with NUXT_CLAUDE_MODEL / NUXT_CLAUDE_EFFORT in .env
  runtimeConfig: {
    claudeModel: 'claude-opus-5-5',
    claudeEffort: 'low', // low = fastest answers during a live draft
  },
  app: {
    head: { title: 'Fearless Coach' },
  },
  vite: {
    plugins: [tailwindcss() as any],
  },
})
