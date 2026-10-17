<template>
  <div class="min-h-screen">
    <header class="flex items-center gap-6 border-b border-zinc-800 px-6 py-3">
      <NuxtLink to="/" class="font-semibold tracking-wide">
        Fearless <span class="text-amber-400">Coach</span>
      </NuxtLink>
      <nav class="flex gap-4 text-sm text-zinc-400">
        <NuxtLink to="/" class="hover:text-zinc-100" exact-active-class="text-zinc-100">
          Draft
        </NuxtLink>
        <NuxtLink to="/team" class="hover:text-zinc-100" active-class="text-zinc-100">
          Team
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
        title="Development keys expire every 24 h: regenerate one here, paste it into .env (RIOT_API_KEY) and restart the server"
      >
        Riot API key ↗
      </a>
    </header>
    <main class="mx-auto max-w-[1600px] px-6 py-6">
      <NuxtPage />
    </main>
  </div>
</template>
