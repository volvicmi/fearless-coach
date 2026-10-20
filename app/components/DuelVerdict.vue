<script setup lang="ts">
import type { Side } from '#shared/draft'
import { otherSide } from '#shared/draft'
import type { DuelVerdict } from '#shared/types'

const props = defineProps<{
  verdict: DuelVerdict
  /** Qui joue chaque côté dans cette game */
  names: Record<Side, string>
  champs: Record<Side, string[]>
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
}>()

const SIDE_LABEL: Record<Side, string> = { blue: 'Bleu', red: 'Rouge' }
const winner = computed(() => props.verdict.winner)
const gap = computed(() => Math.abs(props.verdict.blue.winRate - props.verdict.red.winRate))
const margin = computed(() => (gap.value <= 6 ? 'Victoire serrée' : gap.value <= 14 ? 'Victoire nette' : 'Victoire écrasante'))
const sign = (x: number) => `${x >= 0 ? '+' : ''}${x}`
const delta = computed(() => props.verdict.blue.winRate - props.verdict.data.blue)

/** Le côté qu'un facteur avantage, avec son nom. Impact nul : personne. */
const favours = (impact: number) => (impact > 0 ? props.names.blue : impact < 0 ? props.names.red : '')
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Le vainqueur -->
    <section class="flex flex-col gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-5">
      <div class="flex flex-wrap items-center gap-3">
        <div>
          <p class="text-xs font-medium uppercase tracking-wider text-amber-300/80">
            A mieux drafté
          </p>
          <p class="text-2xl font-semibold">
            {{ names[winner] }}
            <span class="text-sm font-normal" :class="winner === 'blue' ? 'text-side-blue' : 'text-side-red'">· côté {{ SIDE_LABEL[winner].toLowerCase() }}</span>
          </p>
        </div>
        <span class="ml-auto rounded-full bg-amber-400/15 px-3 py-1 text-sm font-medium text-amber-300">{{ margin }}</span>
      </div>

      <div>
        <div class="mb-1 flex items-baseline justify-between text-sm font-semibold tabular-nums">
          <span class="text-side-blue">{{ names.blue }} · {{ verdict.blue.winRate }}%</span>
          <span class="text-side-red">{{ verdict.red.winRate }}% · {{ names.red }}</span>
        </div>
        <div class="flex h-2.5 overflow-hidden rounded-full bg-zinc-800" role="img" :aria-label="`${names.blue} ${verdict.blue.winRate} %, ${names.red} ${verdict.red.winRate} %`">
          <div class="bg-side-blue" :style="{ width: `${verdict.blue.winRate}%` }" />
          <div class="bg-side-red" :style="{ width: `${verdict.red.winRate}%` }" />
        </div>
      </div>

      <p class="text-sm leading-relaxed text-zinc-200">
        {{ verdict.verdict }}
      </p>
    </section>

    <!-- Le détail par joueur -->
    <div class="grid gap-4 lg:grid-cols-2">
      <article
        v-for="side in ([winner, otherSide(winner)] as const)"
        :key="side"
        class="flex flex-col gap-3 rounded-xl border bg-zinc-900/40 p-4"
        :class="side === winner ? 'border-transparent bg-zinc-900' : 'border-transparent bg-zinc-900'"
      >
        <header class="flex flex-wrap items-center gap-2">
          <span class="font-semibold" :class="side === 'blue' ? 'text-side-blue' : 'text-side-red'">{{ names[side] }}</span>
          <span class="text-xs text-zinc-500">côté {{ SIDE_LABEL[side].toLowerCase() }}</span>
          <span v-if="side === winner" class="rounded bg-amber-400/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-300">Vainqueur</span>
          <span class="ml-auto text-lg font-bold tabular-nums">{{ verdict[side].winRate }}%</span>
        </header>

        <div class="flex gap-1">
          <img v-for="c in champs[side]" :key="c" :src="iconUrl(c)" :alt="nameOf(c)" :title="nameOf(c)" class="size-9 rounded">
        </div>
        <p class="text-sm font-medium text-amber-300">
          {{ verdict[side].archetype }}
        </p>

        <div>
          <h4 class="mb-1 text-[11px] font-semibold uppercase font-display tracking-wider text-emerald-400">
            Points forts
          </h4>
          <ul class="list-inside list-disc text-sm text-zinc-300">
            <li v-for="t in verdict[side].strengths" :key="t">
              {{ t }}
            </li>
          </ul>
        </div>
        <div>
          <h4 class="mb-1 text-[11px] font-semibold uppercase font-display tracking-wider text-red-400">
            Ce qui manque
          </h4>
          <ul class="list-inside list-disc text-sm text-zinc-300">
            <li v-for="t in verdict[side].missing" :key="t">
              {{ t }}
            </li>
          </ul>
        </div>
        <div>
          <h4 class="mb-1 text-[11px] font-semibold uppercase font-display tracking-wider text-zinc-400">
            Comment mieux drafter
          </h4>
          <p class="text-sm leading-relaxed text-zinc-300">
            {{ verdict[side].better }}
          </p>
        </div>
      </article>
    </div>

    <!-- D'où vient le pourcentage -->
    <details class="cut bg-zinc-900 px-4 py-3 text-sm">
      <summary class="cursor-pointer select-none font-medium text-zinc-300">
        Comment le pourcentage est calculé
      </summary>
      <div class="mt-3 flex flex-col gap-2">
        <p class="text-xs text-zinc-500">
          Estimation chiffrée : {{ names.blue }} {{ verdict.data.blue }}% / {{ names.red }} {{ 100 - verdict.data.blue }}%.
          L’IA l’ajuste de {{ sign(delta) }} pt pour {{ names.blue }} ({{ verdict.blue.winRate }}%) selon les synergies, matchups et scaling, dans la limite de ±10 points.
          Estimé sur la draft seule, pas sur le niveau des joueurs.
        </p>
        <ul class="flex flex-col gap-1">
          <li v-for="f in verdict.data.factors" :key="f.label" class="text-xs">
            <span class="font-medium text-zinc-200">{{ f.label }}</span>
            <span class="text-zinc-500"> · {{ f.detail }}</span>
            <span v-if="favours(f.impact)" class="text-zinc-400"> → avantage {{ favours(f.impact) }} ({{ sign(Math.abs(f.impact)) }} pts)</span>
          </li>
          <li v-if="!verdict.data.factors.length" class="text-xs text-zinc-500">
            Aucune donnée chiffrée sur cette draft : importe les données pro (onglet Pro) pour affiner l’estimation.
          </li>
        </ul>
        <p class="text-[11px] text-zinc-600">
          {{ verdict.model }} · {{ (verdict.ms / 1000).toFixed(1) }} s
        </p>
      </div>
    </details>
  </div>
</template>
