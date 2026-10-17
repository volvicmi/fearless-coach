<script setup lang="ts">
import { fearlessLocked } from '#shared/draft'
import type { FearlessMode } from '#shared/draft'
import type { Game } from '#shared/types'

const props = defineProps<{
  fearless: FearlessMode
  games: Game[]
  game: Game
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
}>()

/** Champions bloqués pour les deux équipes dans cette game, groupés par la game qui les a brûlés. */
const byGame = computed(() => {
  const groups = new Map<number, string[]>()
  for (const [champ, n] of fearlessLocked(props.fearless, props.games, props.game)) {
    groups.set(n, [...(groups.get(n) ?? []), champ])
  }
  return [...groups].map(([n, champs]) => ({ n, champs }))
})
const total = computed(() => byGame.value.reduce((n, g) => n + g.champs.length, 0))
</script>

<template>
  <section v-if="fearless !== 'off'" class="rounded-lg border border-zinc-800 p-3">
    <h3 class="mb-2 text-sm font-semibold">
      Bloqués par le Fearless
      <span class="font-normal text-zinc-500">· les deux équipes ({{ total }})</span>
    </h3>
    <p v-if="!byGame.length" class="text-xs text-zinc-500">
      Rien de bloqué pour l’instant : les picks de cette game seront bloqués dès la suivante.
    </p>
    <div v-for="group in byGame" :key="group.n" class="flex items-center gap-2 py-0.5">
      <span class="w-7 text-xs text-zinc-500">G{{ group.n }}</span>
      <div class="flex flex-wrap gap-1">
        <img
          v-for="champ in group.champs"
          :key="champ"
          :src="iconUrl(champ)"
          :alt="nameOf(champ)"
          :title="nameOf(champ)"
          class="size-8 rounded grayscale"
        >
      </div>
    </div>
  </section>
</template>
