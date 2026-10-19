<script setup lang="ts">
import { GAME_PLAN } from '#shared/game-plan'
</script>

<template>
  <!-- Pensé pour téléphone : une colonne, texte large, rien de caché -->
  <div class="mx-auto flex max-w-xl flex-col gap-5">
    <div>
      <h1 class="text-2xl font-semibold">
        Plan de jeu
      </h1>
      <p class="text-sm text-zinc-400">
        À lire avant une game et à garder sous les yeux pendant le scrim.
      </p>
    </div>

    <!-- Accès rapide à un rôle -->
    <nav class="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto bg-zinc-950/95 px-4 py-2" aria-label="Rôles">
      <a
        v-for="r in GAME_PLAN"
        :key="r.id"
        :href="`#role-${r.id}`"
        class="shrink-0 rounded-full border border-zinc-700 px-4 py-1.5 text-sm text-zinc-200 hover:border-amber-400"
      >
        {{ r.label }}
      </a>
    </nav>

    <section
      v-for="r in GAME_PLAN"
      :id="`role-${r.id}`"
      :key="r.id"
      class="flex scroll-mt-16 flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
    >
      <h2 class="text-xl font-semibold text-amber-300">
        {{ r.label }}
      </h2>
      <p class="rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
        <span class="font-semibold">Règle d’or :</span> {{ r.golden }}
      </p>

      <article
        v-for="p in [r.phases.early, r.phases.mid, r.phases.late]"
        :key="p.label"
        class="flex flex-col gap-1.5"
      >
        <h3 class="text-base font-semibold text-zinc-100">
          {{ p.label }} <span class="font-normal text-zinc-400">· {{ p.focus }}</span>
        </h3>
        <ul class="flex list-disc flex-col gap-1 pl-5 text-[15px] text-zinc-200">
          <li v-for="s in p.steps" :key="s">
            {{ s }}
          </li>
        </ul>
      </article>
    </section>
  </div>
</template>
