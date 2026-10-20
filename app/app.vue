<script setup lang="ts">
const route = useRoute()
// L'onglet Draft reste allumé dans une série d'équipe (/series) comme dans un duel (/duel).
const draftActive = computed(() => route.path === '/' || route.path.startsWith('/series') || route.path.startsWith('/duel'))
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-800 px-4 py-3 md:px-6">
      <NuxtLink to="/" class="font-semibold tracking-wide">
        Fearless <span class="text-amber-400">Coach</span>
      </NuxtLink>
      <nav class="flex gap-4 text-sm text-zinc-400">
        <NuxtLink to="/" class="hover:text-zinc-100" :class="{ 'text-zinc-100': draftActive }">
          Draft
        </NuxtLink>
        <NuxtLink to="/prep" class="hover:text-zinc-100" active-class="text-zinc-100">
          Prep
        </NuxtLink>
        <NuxtLink to="/champions" class="hover:text-zinc-100" active-class="text-zinc-100">
          Champions
        </NuxtLink>
        <NuxtLink to="/team" class="hover:text-zinc-100" active-class="text-zinc-100">
          Team
        </NuxtLink>
        <NuxtLink to="/planning" class="hover:text-zinc-100" active-class="text-zinc-100">
          Planning
        </NuxtLink>
        <NuxtLink to="/pro" class="hover:text-zinc-100" active-class="text-zinc-100">
          Pro
        </NuxtLink>
        <NuxtLink to="/notes" class="hover:text-zinc-100" active-class="text-zinc-100">
          Notes
        </NuxtLink>
      </nav>
      <a
        href="https://developer.riotgames.com/"
        target="_blank"
        rel="noopener noreferrer"
        class="ml-auto rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
        title="Les clés de développement expirent toutes les 24 h : régénères-en une ici, colle-la dans .env (RIOT_API_KEY) et redémarre le serveur"
      >
        Clé API Riot ↗
      </a>
    </header>
    <main class="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">
      <NuxtPage />
    </main>
    <footer class="border-t border-zinc-800 px-6 py-4 text-center text-xs text-zinc-500">
      Fearless Coach n'est pas approuvé par Riot Games et ne reflète pas les opinions de Riot Games ou de quiconque ayant officiellement participé à la production ou à la gestion de Riot Games. Riot Games et toutes les propriétés associées sont des marques commerciales ou déposées de Riot Games, Inc.
    </footer>
  </div>
</template>
