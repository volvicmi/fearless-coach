<script setup lang="ts">
const route = useRoute()
// L'onglet Draft reste allumé dans une série d'équipe (/series) comme dans un duel (/duel).
// Une page peut demander à tenir dans l'écran (definePageMeta({ fitScreen: true })) : elle gère alors son propre défilement.
const fitScreen = computed(() => route.meta.fitScreen === true)
const draftActive = computed(() => route.path === '/' || route.path.startsWith('/series') || route.path.startsWith('/duel'))

const tabs = [
  { to: '/prep', label: 'Compo' },
  { to: '/team', label: 'Champpool' },
  { to: '/champions', label: 'Data' },
  { to: '/planning', label: 'Planning' },
  { to: '/pro', label: 'Pro stats' },
  { to: '/notes', label: 'Notes' },
]
// Mot de passe de l'équipe : `enabled` est faux en local tant qu'il n'est pas configuré.
const { data: me } = await useFetch<{ enabled: boolean, loggedIn: boolean }>('/api/auth/me', { key: 'me' })
async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login', { external: true })
}
const tabClass = 'px-3.5 py-2 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-100'
</script>

<template>
  <div class="flex flex-col" :class="fitScreen ? 'h-screen' : 'min-h-screen'">
    <header class="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-zinc-800/80 px-4 py-2.5 md:px-6">
      <NuxtLink to="/" class="font-display text-2xl font-extrabold italic leading-none tracking-wider" title="Fearless Coach">
        OP<span class="text-white">I</span>F
      </NuxtLink>
      <nav v-if="route.path !== '/login'" class="flex max-w-full gap-1 overflow-x-auto font-display text-sm font-semibold uppercase tracking-[0.08em]">
        <NuxtLink to="/" :class="[tabClass, draftActive && 'tab-on']">
          Drafter
        </NuxtLink>
        <NuxtLink v-for="t in tabs" :key="t.to" :to="t.to" :class="tabClass" active-class="tab-on">
          {{ t.label }}
        </NuxtLink>
      </nav>
      <a
        v-if="route.path !== '/login'"
        href="https://developer.riotgames.com/"
        target="_blank"
        rel="noopener noreferrer"
        class="ml-auto bg-zinc-800 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
        title="Les clés de développement expirent toutes les 24 h : régénères-en une ici, colle-la dans .env (RIOT_API_KEY) et redémarre le serveur"
      >
        Clé API Riot ↗
      </a>
      <button v-if="me?.loggedIn" type="button" class="cursor-pointer bg-zinc-800 px-2.5 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100" @click="logout">
        Déconnexion
      </button>
    </header>
    <main class="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col" :class="route.meta.prepLayout ? 'prep-app-main' : 'px-6 py-6'">
      <NuxtPage />
    </main>
    <ConfirmDialog />
  </div>
</template>
