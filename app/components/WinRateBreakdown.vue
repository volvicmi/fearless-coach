<script setup lang="ts">
import type { Side } from '#shared/draft'
import type { WinRateEstimate } from '#shared/winrate'

const props = defineProps<{
  estimate: WinRateEstimate
  /** Final blue % after the AI adjusted the data estimate */
  aiBlue?: number
  ourSide: Side
}>()

const shown = computed(() => props.aiBlue ?? props.estimate.blue)
const ours = (blue: number) => (props.ourSide === 'blue' ? blue : 100 - blue)
const sign = (x: number) => `${x >= 0 ? '+' : ''}${x}`
/** Impact from our point of view: positive = good for us. */
const forUs = (impact: number) => (props.ourSide === 'blue' ? impact : -impact)
</script>

<template>
  <div class="flex flex-col gap-2 rounded-md bg-zinc-900/60 p-3">
    <div class="flex items-baseline gap-2">
      <span class="text-sm font-semibold">Win chance</span>
      <span class="ml-auto text-lg font-bold tabular-nums" :class="ours(shown) >= 50 ? 'text-emerald-400' : 'text-red-400'">
        {{ ours(shown) }}% <span class="text-xs font-normal text-zinc-500">for us</span>
      </span>
    </div>
    <div class="flex h-2 overflow-hidden rounded-full">
      <div class="bg-side-blue" :style="{ width: `${shown}%` }" />
      <div class="bg-side-red" :style="{ width: `${100 - shown}%` }" />
    </div>
    <p class="text-[11px] text-zinc-500">
      <template v-if="aiBlue !== undefined">
        Data {{ ours(estimate.blue) }}% → AI {{ ours(aiBlue) }}% ({{ sign(ours(aiBlue) - ours(estimate.blue)) }} pts: synergies, matchups, scaling)
      </template>
      <template v-else>
        Data estimate, before any AI adjustment: ask for the review to add synergies and matchups.
      </template>
    </p>
    <ul class="flex flex-col gap-1">
      <li v-for="f in estimate.factors" :key="f.label" class="flex gap-2 text-xs">
        <span class="w-12 shrink-0 text-right font-semibold tabular-nums" :class="forUs(f.impact) > 0 ? 'text-emerald-400' : forUs(f.impact) < 0 ? 'text-red-400' : 'text-zinc-500'">
          {{ sign(forUs(f.impact)) }}
        </span>
        <span>
          <span class="font-medium text-zinc-200">{{ f.label }}</span>
          <span class="text-zinc-500"> · {{ f.detail }}</span>
        </span>
      </li>
      <li v-if="!estimate.factors.length" class="text-xs text-zinc-500">
        No data yet: import pro data (Pro tab) and fill your pools (Team tab).
      </li>
    </ul>
  </div>
</template>
