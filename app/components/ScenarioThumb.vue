<script setup lang="ts">
import { DRAFT_ORDER } from '#shared/draft'
import type { Side } from '#shared/draft'
import type { PrepScenario } from '#shared/types'

const props = defineProps<{
  scenario: PrepScenario
  active: boolean
  iconUrl: (id: string) => string
  nameOf: (id: string) => string
}>()

/** The 5 bans / 5 picks of a side, each as its list of alternatives. */
function slotsFor(side: Side, type: 'ban' | 'pick') {
  const out: string[][] = []
  DRAFT_ORDER.forEach((s, i) => {
    if (s.side === side && s.type === type) out[s.slot] = props.scenario.slots[i] ?? []
  })
  return out
}
const style = computed(() => styleOf(props.scenario.color))
const bans = computed(() => slotsFor(props.scenario.ourSide, 'ban'))
const picks = computed(() => slotsFor(props.scenario.ourSide, 'pick'))
/** Our steps filled, out of 10 (we only plan our own draft). */
const filled = computed(() => [...bans.value, ...picks.value].filter(s => s.length).length)
</script>

<template>
  <div
    class="flex cursor-pointer flex-col gap-2 rounded-lg border-l-4 bg-zinc-900/60 p-2.5 transition-colors hover:bg-zinc-900"
    :class="[style.border, active ? 'ring-2 ring-zinc-200/70' : 'ring-1 ring-zinc-800']"
  >
    <div class="flex items-center gap-2">
      <span class="truncate text-sm font-semibold">{{ scenario.name }}</span>
      <span
        class="ml-auto rounded px-1.5 text-[10px] font-bold uppercase"
        :class="scenario.ourSide === 'blue' ? 'bg-side-blue/20 text-side-blue' : 'bg-side-red/20 text-side-red'"
      >{{ scenario.ourSide === 'blue' ? 'bleu' : 'rouge' }}</span>
    </div>
    <!-- Our draft only: 5 bans, then 5 picks (main choice, +n backups) -->
    <div class="flex gap-0.5">
      <template v-for="(alts, i) in bans" :key="`b${i}`">
        <img v-if="alts[0]" :src="iconUrl(alts[0])" :alt="nameOf(alts[0])" class="size-5 rounded-sm opacity-60 grayscale">
        <span v-else class="size-5 rounded-sm bg-zinc-800" />
      </template>
    </div>
    <div class="flex gap-1">
      <span v-for="(alts, i) in picks" :key="`p${i}`" class="relative">
        <img
          v-if="alts[0]"
          :src="iconUrl(alts[0])"
          :alt="nameOf(alts[0])"
          class="size-8 rounded"
          :class="scenario.ourSide === 'blue' ? 'ring-1 ring-side-blue/60' : 'ring-1 ring-side-red/60'"
        >
        <span v-else class="block size-8 rounded bg-zinc-800" />
        <span
          v-if="alts.length > 1"
          class="absolute -bottom-1 -right-1 rounded bg-zinc-950 px-0.5 text-[9px] font-bold leading-tight text-zinc-300 ring-1 ring-zinc-700"
        >+{{ alts.length - 1 }}</span>
      </span>
    </div>
    <div class="flex items-center gap-2 text-[10px] text-zinc-500">
      <span :class="style.text">{{ style.label }}</span>
      <span>· {{ filled }}/10 étapes</span>
      <span v-if="scenario.notes" class="truncate">· {{ scenario.notes.split('\n')[0] }}</span>
    </div>
  </div>
</template>
