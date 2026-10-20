<script setup lang="ts">
import { DRAFT_ORDER, MAX_GAMES, otherSide, picksOf, slotsOf } from '#shared/draft'
import type { Side } from '#shared/draft'
import type { Game, Series, SeriesDetail } from '#shared/types'

// Carte « Scoreboard » de l'accueil Draft : les deux camps et le score, puis une ligne par game
// avec les deux compos face à face, le vainqueur et, en duel, la barre du juge IA.
const props = defineProps<{ series: Series, iconUrl: (id: string) => string }>()
defineEmits<{ remove: [] }>()

const { data: detail } = useFetch<SeriesDetail>(() => `/api/series/${props.series.id}`, { key: `series-card-${props.series.id}` })

const duel = computed(() => props.series.mode === 'duel')
const summary = computed(() => seriesSummary(props.series))
// En scrim, le camp A s'affiche « Opif » en grand (« Nous » dessous)
const labels = computed(() => (duel.value ? sideLabels(props.series) : { ...sideLabels(props.series), a: 'Opif' }))
const STEPS = DRAFT_ORDER.length

interface Row { n: number, game?: Game, aSide: Side, bSide: Side, steps: number, result: 'a' | 'b' | 'live' | null }
const rows = computed<Row[]>(() => Array.from({ length: MAX_GAMES[props.series.format] }, (_, i) => {
  const game = detail.value?.games.find(g => g.n === i + 1)
  const aSide = game?.ourSide ?? 'blue'
  return { n: i + 1, game, aSide, bSide: otherSide(aSide), steps: game?.actions.length ?? 0, result: props.series.results?.[i] ?? null }
}))

// Fearless : champions déjà joués dans les games terminées, bloqués pour la suite
const locked = computed(() => {
  if (props.series.fearless === 'off' || !detail.value) return 0
  const done = detail.value.games.filter(g => g.actions.length >= STEPS)
  return new Set(done.flatMap(g => [...picksOf(g.actions, 'blue'), ...picksOf(g.actions, 'red')])).size
})

const status = computed(() => {
  if (summary.value.over) {
    const winner = summary.value.a > summary.value.b ? labels.value.a : labels.value.b
    return duel.value ? `${winner} remporte la série` : summary.value.a > summary.value.b ? 'Série gagnée' : 'Série perdue'
  }
  const live = [...rows.value].reverse().find(r => r.steps > 0)
  if (!live) return 'Pas commencée'
  return live.steps < STEPS ? `Game ${live.n} : draft en cours` : `Game ${live.n} jouée`
})

// Pourcentage du juge IA pour le camp A (duel), à partir du verdict enregistré
const verdictA = (r: Row) => r.game?.verdict?.[r.aSide]?.winRate ?? null
const sideName = (s: Side) => (s === 'blue' ? 'bleu' : 'rouge')
</script>

<template>
  <article class="cut group relative flex flex-col bg-zinc-900 transition-colors hover:bg-zinc-800/60">
    <!-- Toute la carte ouvre la série ; Supprimer passe au-dessus -->
    <NuxtLink :to="seriesPath(series)" class="absolute inset-0 z-0" :aria-label="`Ouvrir ${series.name}`" />

    <div class="pointer-events-none relative flex flex-wrap items-center gap-1.5 px-4 pt-3 font-display text-[11px] font-bold uppercase tracking-wider">
      <span class="px-2 py-0.5" :class="duel ? 'bg-amber-400/15 text-amber-200' : 'bg-side-blue/15 text-sky-300'">{{ duel ? 'Duel 1v1' : 'Scrim' }}</span>
      <span class="bg-zinc-800 px-2 py-0.5 text-zinc-400">{{ series.format }}</span>
      <span class="bg-zinc-800 px-2 py-0.5 text-zinc-400">{{ series.fearless === 'off' ? 'Draft normale' : 'Fearless' }}</span>
      <span v-if="!summary.over" class="bg-emerald-500/15 px-2 py-0.5 text-emerald-300">En cours</span>
      <span class="ml-auto font-sans text-xs font-normal normal-case tracking-normal text-zinc-500">{{ relativeDate(series.createdAt) }}</span>
    </div>

    <!-- Tableau de score -->
    <div class="pointer-events-none relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-4 pb-3 pt-3.5">
      <div class="min-w-0">
        <p class="truncate font-display text-2xl font-extrabold uppercase leading-tight tracking-wide">{{ labels.a }}</p>
        <p class="text-xs text-zinc-500">{{ duel ? 'Joueur 1' : 'Nous' }}</p>
      </div>
      <p class="flex items-baseline gap-2.5 font-display text-4xl font-extrabold italic tabular-nums leading-none">
        <span :class="summary.a > summary.b && 'text-amber-400'">{{ summary.a }}</span>
        <span class="text-2xl text-zinc-600">–</span>
        <span :class="summary.b > summary.a && 'text-amber-400'">{{ summary.b }}</span>
      </p>
      <div class="min-w-0 text-right">
        <p class="truncate font-display text-2xl font-extrabold uppercase leading-tight tracking-wide">{{ labels.b }}</p>
        <p class="text-xs text-zinc-500">{{ duel ? 'Joueur 2' : 'Adversaire' }}</p>
      </div>
    </div>

    <!-- Une ligne par game -->
    <div class="pointer-events-none relative flex flex-col gap-1 px-2.5 pb-2.5">
      <template v-for="r in rows" :key="r.n">
        <div v-if="!r.steps" class="grid grid-cols-[2.25rem_1fr] items-center gap-2.5 px-2 py-1.5 text-xs text-zinc-600">
          <span class="font-display text-[13px] font-bold">G{{ r.n }}</span>
          <span>{{ r.game ? 'Draft pas encore commencée' : 'Pas encore jouée' }}</span>
        </div>
        <div v-else class="grid grid-cols-[2.25rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2.5 bg-zinc-800 px-2 py-1.5">
          <span class="font-display text-[13px] font-bold text-zinc-400">G{{ r.n }}</span>
          <div class="flex gap-[3px]" :title="`${labels.a} · côté ${sideName(r.aSide)}`">
            <template v-for="(c, i) in slotsOf(r.game!.actions, r.aSide, 'pick')" :key="i">
              <img v-if="c" :src="iconUrl(c)" :alt="c" class="size-[26px]">
              <span v-else class="size-[26px] bg-zinc-900" />
            </template>
          </div>
          <span
            class="min-w-20 text-center font-display text-[11px] font-bold uppercase tracking-wider"
            :class="r.steps < STEPS ? 'text-amber-300' : r.result === 'a' ? 'text-emerald-300' : r.result === 'b' ? 'text-rose-400' : 'text-zinc-600'"
          >
            <template v-if="r.steps < STEPS">Étape {{ r.steps }}/{{ STEPS }}</template>
            <template v-else-if="r.result === 'a'">{{ labels.a }} gagne</template>
            <template v-else-if="r.result === 'b'">{{ labels.b }} gagne</template>
            <template v-else>Vainqueur ?</template>
          </span>
          <div class="flex justify-end gap-[3px]" :title="`${labels.b} · côté ${sideName(r.bSide)}`">
            <template v-for="(c, i) in slotsOf(r.game!.actions, r.bSide, 'pick')" :key="i">
              <img v-if="c" :src="iconUrl(c)" :alt="c" class="size-[26px]">
              <span v-else class="size-[26px] bg-zinc-900" />
            </template>
          </div>
          <!-- Duel : barre du juge IA, aux couleurs des côtés -->
          <div v-if="verdictA(r) !== null" class="col-start-2 col-end-5 mt-1 flex h-1" :title="`Juge IA : ${verdictA(r)} % / ${100 - verdictA(r)!} %`">
            <i :class="r.aSide === 'blue' ? 'bg-side-blue' : 'bg-side-red'" :style="{ width: `${verdictA(r)}%` }" />
            <i :class="r.bSide === 'blue' ? 'bg-side-blue' : 'bg-side-red'" :style="{ width: `${100 - verdictA(r)!}%` }" />
          </div>
        </div>
      </template>
    </div>

    <div class="pointer-events-none relative mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-3.5 pt-1.5 text-xs text-zinc-400">
      <span class="font-semibold text-zinc-100">{{ status }}</span>
      <span v-if="series.fearless !== 'off'">{{ locked }} champion{{ locked > 1 ? 's' : '' }} bloqué{{ locked > 1 ? 's' : '' }}</span>
      <button
        type="button"
        class="pointer-events-auto relative z-10 ml-auto text-zinc-600 opacity-0 transition-opacity hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
        @click="$emit('remove')"
      >
        Supprimer
      </button>
      <span class="btn-action text-xs">{{ summary.over ? 'Revoir' : 'Reprendre' }}</span>
    </div>
  </article>
</template>
