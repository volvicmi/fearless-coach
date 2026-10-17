<script setup lang="ts">
import type { Side } from '#shared/draft'
import type { CompReview } from '#shared/types'

defineProps<{
  side: Side
  isUs: boolean
  comp: CompReview
  champs: string[]
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
}>()
</script>

<template>
  <article class="flex flex-col gap-2 rounded-md bg-zinc-900/60 p-3">
    <header class="flex items-center gap-2">
      <span class="text-sm font-semibold capitalize" :class="side === 'blue' ? 'text-side-blue' : 'text-side-red'">
        {{ side === 'blue' ? 'Bleu' : 'Rouge' }} · {{ isUs ? 'Nous' : 'Eux' }}
      </span>
      <span class="ml-auto text-lg font-bold tabular-nums">{{ comp.winRate }}%</span>
    </header>
    <div class="flex gap-1">
      <img v-for="c in champs" :key="c" :src="iconUrl(c)" :alt="nameOf(c)" :title="nameOf(c)" class="size-7 rounded">
    </div>
    <p class="text-xs font-medium text-amber-300">
      {{ comp.archetype }}
    </p>
    <div>
      <h4 class="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        Conditions de victoire
      </h4>
      <ul class="list-inside list-disc text-xs text-zinc-300">
        <li v-for="w in comp.winConditions" :key="w">
          {{ w }}
        </li>
      </ul>
    </div>
    <p class="text-xs">
      <span class="font-semibold text-zinc-400">Pics de puissance :</span> {{ comp.powerSpikes }}
    </p>
    <p class="text-xs">
      <span class="font-semibold text-zinc-400">Plan de jeu :</span> {{ comp.gamePlan }}
    </p>
    <div>
      <h4 class="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {{ isUs ? 'Comment ils peuvent nous battre' : 'Comment les battre' }}
      </h4>
      <ul class="list-inside list-disc text-xs text-zinc-300">
        <li v-for="c in comp.howToCounter" :key="c">
          {{ c }}
        </li>
      </ul>
    </div>
  </article>
</template>
