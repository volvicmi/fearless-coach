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
const style = computed(() => SCENARIO_STYLE[props.scenario.color])
const filled = computed(() => props.scenario.slots.filter(s => s.length).length)
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
      >{{ scenario.ourSide }}</span>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <div v-for="side in (['blue', 'red'] as const)" :key="side" class="flex flex-col gap-1">
        <div class="flex gap-0.5">
          <template v-for="(alts, i) in slotsFor(side, 'ban')" :key="`b${i}`">
            <img v-if="alts[0]" :src="iconUrl(alts[0])" :alt="nameOf(alts[0])" class="size-4 rounded-sm opacity-60 grayscale">
            <span v-else class="size-4 rounded-sm bg-zinc-800" />
          </template>
        </div>
        <div class="flex gap-0.5">
          <span v-for="(alts, i) in slotsFor(side, 'pick')" :key="`p${i}`" class="relative">
            <img
              v-if="alts[0]"
              :src="iconUrl(alts[0])"
              :alt="nameOf(alts[0])"
              class="size-6 rounded"
              :class="side === 'blue' ? 'ring-1 ring-side-blue/60' : 'ring-1 ring-side-red/60'"
            >
            <span v-else class="block size-6 rounded bg-zinc-800" />
            <span
              v-if="alts.length > 1"
              class="absolute -bottom-1 -right-1 rounded bg-zinc-950 px-0.5 text-[9px] font-bold leading-tight text-zinc-300 ring-1 ring-zinc-700"
            >+{{ alts.length - 1 }}</span>
          </span>
        </div>
      </div>
    </div>
    <div class="flex items-center gap-2 text-[10px] text-zinc-500">
      <span>{{ filled }}/20 steps</span>
      <span v-if="scenario.notes" class="truncate">· {{ scenario.notes.split('\n')[0] }}</span>
    </div>
  </div>
</template>
