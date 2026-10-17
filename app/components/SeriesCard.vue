<script setup lang="ts">
import { MAX_GAMES } from '#shared/draft'
import type { Series } from '#shared/types'

const props = defineProps<{ series: Series }>()
defineEmits<{ remove: [] }>()

const duel = computed(() => props.series.mode === 'duel')
const summary = computed(() => seriesSummary(props.series))
const labels = computed(() => sideLabels(props.series))

// Un point par game possible du format : gagnée par A, gagnée par B, en cours, pas encore jouée.
const dots = computed(() => Array.from({ length: MAX_GAMES[props.series.format] }, (_, i) => {
  const results = props.series.results ?? []
  if (i >= results.length) return 'todo'
  return results[i] ?? 'live'
}))

// En duel, chaque joueur a sa couleur ; en équipe, vert = on gagne, rouge = on perd.
const COLORS = computed(() => duel.value
  ? { a: 'bg-amber-400', b: 'bg-violet-400', aText: 'text-amber-300', bText: 'text-violet-300' }
  : { a: 'bg-emerald-500', b: 'bg-red-500', aText: 'text-emerald-400', bText: 'text-red-400' })
const DOT = computed<Record<string, string>>(() => ({
  a: COLORS.value.a,
  b: COLORS.value.b,
  live: 'border border-zinc-400 animate-pulse',
  todo: 'bg-zinc-800',
}))
const DOT_TITLE: Record<string, string> = { a: 'gagnée', b: 'perdue', live: 'en cours', todo: 'pas encore jouée' }

const status = computed(() => {
  if (summary.value.over) {
    const winner = summary.value.a > summary.value.b ? labels.value.a : labels.value.b
    return duel.value ? `${winner} remporte la série` : summary.value.a > summary.value.b ? 'Série gagnée' : 'Série perdue'
  }
  const n = props.series.gameCount ?? 0
  return n ? `Game ${n} en cours` : 'Pas commencée'
})
</script>

<template>
  <article class="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-600">
    <!-- Bandeau d'identité du mode : bleu contre rouge pour un duel, ambre pour l'équipe -->
    <div class="absolute inset-x-0 top-0 h-0.5" :class="duel ? 'bg-gradient-to-r from-side-blue via-zinc-700 to-side-red' : 'bg-amber-400/70'" />

    <!-- Toute la carte ouvre la série ; le bouton Supprimer passe au-dessus -->
    <NuxtLink :to="seriesPath(series)" class="absolute inset-0 z-0" :aria-label="`Ouvrir ${series.name}`" />

    <div class="pointer-events-none relative flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
      <span class="rounded px-1.5 py-0.5" :class="duel ? 'bg-violet-400/15 text-violet-300' : 'bg-amber-400/15 text-amber-300'">
        {{ duel ? 'Duel 1v1' : 'Équipe' }}
      </span>
      <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">{{ series.format }}</span>
      <span class="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">{{ series.fearless === 'off' ? 'Draft normale' : 'Fearless' }}</span>
      <span class="ml-auto text-zinc-500">{{ relativeDate(series.createdAt) }}</span>
    </div>

    <div class="pointer-events-none relative min-w-0">
      <h3 class="truncate font-semibold">
        {{ series.name }}
      </h3>
      <p class="truncate text-sm text-zinc-400">
        <template v-if="duel">
          <span :class="COLORS.aText">{{ series.playerA }}</span> contre <span :class="COLORS.bText">{{ series.playerB }}</span>
        </template>
        <template v-else>
          contre {{ series.opponent || 'adversaire non renseigné' }}
        </template>
      </p>
    </div>

    <div class="pointer-events-none relative mt-auto flex items-center gap-3 pt-1">
      <div class="flex items-center gap-1.5" role="img" :aria-label="`Games : ${dots.map(d => DOT_TITLE[d]).join(', ')}`">
        <span v-for="(d, i) in dots" :key="i" class="size-2.5 rounded-full" :class="DOT[d]" :title="`Game ${i + 1} : ${DOT_TITLE[d]}`" />
      </div>
      <span class="text-lg font-semibold tabular-nums">
        <span :class="summary.a > summary.b ? COLORS.aText : ''">{{ summary.a }}</span>
        <span class="text-zinc-600"> – </span>
        <span :class="summary.b > summary.a ? COLORS.bText : ''">{{ summary.b }}</span>
      </span>
      <span class="truncate text-xs text-zinc-500">{{ status }}</span>
      <button
        type="button"
        class="pointer-events-auto relative z-10 ml-auto cursor-pointer text-xs text-zinc-600 opacity-0 transition-opacity hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
        @click="$emit('remove')"
      >
        Supprimer
      </button>
    </div>
  </article>
</template>
