import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  app: {
    head: { title: 'Fearless Coach' },
  },
  vite: {
    plugins: [tailwindcss() as any],
  },
})
